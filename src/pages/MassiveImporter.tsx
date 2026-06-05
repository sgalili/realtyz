import { useState, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { parsePdfToRows } from '@/lib/parsePdfTable';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Clock, Eye, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { useTrialStatus, TRIAL_RECORD_CAP } from '@/hooks/useTrialStatus';
import { DriveImporterPicker } from '@/components/importer/DriveImporterPicker';

const CHUNK_SIZE = 1000;
const PREVIEW_INITIAL = 50;
const PREVIEW_STEP = 50;

/** Canonical fields we know how to import. */
type FieldKey = 'identity_number' | 'full_name' | 'phone_number' | 'city' | 'unknown';

const FIELD_LABELS: Record<FieldKey, string> = {
  identity_number: 'ת.ז',
  full_name: 'שם מלא',
  phone_number: 'טלפון',
  city: 'עיר',
  unknown: 'לא מזוהה',
};

/**
 * Header alias map. We normalize the file's column header (lowercased, whitespace-collapsed)
 * and look it up here. Hebrew + English + common spreadsheet exports.
 */
const HEADER_ALIASES: Record<string, FieldKey> = {
  // identity
  'ת.ז': 'identity_number',
  'תז': 'identity_number',
  'תעודת זהות': 'identity_number',
  'מס זהות': 'identity_number',
  'מספר זהות': 'identity_number',
  'id': 'identity_number',
  'identity': 'identity_number',
  'identity number': 'identity_number',
  'national id': 'identity_number',
  // name
  'שם': 'full_name',
  'שם מלא': 'full_name',
  'שם פרטי ומשפחה': 'full_name',
  'שם הליד': 'full_name',
  'name': 'full_name',
  'full name': 'full_name',
  'fullname': 'full_name',
  // phone
  'טלפון': 'phone_number',
  'טלפון נייד': 'phone_number',
  'נייד': 'phone_number',
  'מספר טלפון': 'phone_number',
  'phone': 'phone_number',
  'phone number': 'phone_number',
  'mobile': 'phone_number',
  'cell': 'phone_number',
  // city
  'עיר': 'city',
  'יישוב': 'city',
  'ישוב': 'city',
  'כתובת': 'city',
  'city': 'city',
  'town': 'city',
  'locality': 'city',
};

function normalizeHeader(h: string): string {
  return String(h ?? '')
    .replace(/\u200f|\u200e/g, '')
    .replace(/[״"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectFieldFromHeader(header: string): FieldKey {
  const n = normalizeHeader(header);
  if (!n) return 'unknown';
  if (HEADER_ALIASES[n]) return HEADER_ALIASES[n];
  // partial match fallback
  for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
    if (n.includes(alias) || alias.includes(n)) return field;
  }
  return 'unknown';
}

function cleanPhone(raw: string): string {
  return String(raw).replace(/[^\d+]/g, '');
}

function normalizeIsraeliPhone(raw: string): string | null {
  if (!raw) return null;
  const cleaned = cleanPhone(String(raw).trim());
  if (!cleaned) return null;
  if (/^9725\d{8}$/.test(cleaned)) return cleaned;
  if (/^05\d{8}$/.test(cleaned)) return '972' + cleaned.slice(1);
  if (/^\+9725\d{8}$/.test(cleaned)) return cleaned.slice(1);
  if (/^5\d{8}$/.test(cleaned)) return '972' + cleaned;
  return null;
}

function validateIsraeliId(id: string | null | undefined): boolean {
  if (!id) return true;
  const trimmed = String(id).replace(/\D/g, '');
  if (trimmed.length > 9 || trimmed.length === 0) return false;
  const padded = trimmed.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let val = parseInt(padded[i]) * ((i % 2) + 1);
    if (val > 9) val -= 9;
    sum += val;
  }
  return sum % 10 === 0;
}

interface ImportStats {
  total: number;
  processed: number;
  inserted: number;
  duplicates: number;
  invalidPhones: number;
  invalidIds: number;
  errors: number;
}

interface FlaggedRow {
  row: number;
  reason: string;
  data: Record<string, string>;
}

interface ParsedFile {
  /** Original headers exactly as they appear in row 1. */
  headers: string[];
  /** Detected field for each header column (same length as headers). */
  detectedFields: FieldKey[];
  /** All data rows (row 2+) as arrays of strings, same width as headers. */
  rows: string[][];
}

export default function MassiveImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [previewLimit, setPreviewLimit] = useState(PREVIEW_INITIAL);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<string>('');
  const [phase, setPhase] = useState<'idle' | 'parsed' | 'importing' | 'done'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const blockDemoAction = useDemoGuard();
  const trial = useTrialStatus();

  /** Build a lookup from canonical field → column index in the parsed rows. */
  const fieldIndex = useMemo<Partial<Record<FieldKey, number>>>(() => {
    if (!parsed) return {};
    const map: Partial<Record<FieldKey, number>> = {};
    parsed.detectedFields.forEach((f, i) => {
      if (f !== 'unknown' && map[f] === undefined) map[f] = i;
    });
    return map;
  }, [parsed]);

  const unknownHeaders = useMemo<string[]>(() => {
    if (!parsed) return [];
    return parsed.headers.filter((_, i) => parsed.detectedFields[i] === 'unknown' && parsed.headers[i].trim() !== '');
  }, [parsed]);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setPhase('idle');
    setStats(null);
    setFlagged([]);
    setProgress(0);
    setPreviewLimit(PREVIEW_INITIAL);

    try {
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      let matrix: string[][];
      if (isPdf) {
        const res = await parsePdfToRows(f);
        if (!res.headers.length) { toast.error('לא נמצאה טבלה ב-PDF'); return; }
        matrix = [res.headers, ...res.rows.map((r) => res.headers.map((h) => r[h] ?? ''))];
      } else {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) { toast.error('הקובץ ריק'); return; }
        const sheet = wb.Sheets[sheetName];
        matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
      }

      if (matrix.length < 2) {
        toast.error('הקובץ חייב לכלול שורת כותרת ולפחות שורת נתונים אחת');
        return;
      }

      const headers = matrix[0].map((h) => String(h ?? '').trim());
      const detectedFields = headers.map(detectFieldFromHeader);

      // data rows = everything after the header. Skip rows that are entirely empty.
      const rows = matrix.slice(1)
        .map((r) => headers.map((_, i) => String(r[i] ?? '').trim()))
        .filter((r) => r.some((cell) => cell !== ''));

      setParsed({ headers, detectedFields, rows });
      setPhase('parsed');
      toast.success(`נקראו ${rows.length.toLocaleString()} רשומות מתוך ${headers.length} עמודות`);
    } catch (err) {
      console.error('parse error', err);
      toast.error('קריאת הקובץ נכשלה - ודא שזה קובץ Excel תקין');
    }
  }, []);

  const startImport = useCallback(async () => {
    if (blockDemoAction('massive-import')) return;
    if (!parsed || parsed.rows.length === 0) return;
    if (fieldIndex.phone_number === undefined) {
      toast.error('חסרה עמודת טלפון - אי אפשר לייבא בלי טלפון');
      return;
    }
    // Trial cap: pre-check current lead count + incoming rows
    if (trial.isTrial) {
      const { count: existingCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('is_demo', false);
      const existing = existingCount ?? 0;
      if (existing + parsed.rows.length > TRIAL_RECORD_CAP) {
        toast.error('מסלול הניסיון מוגבל ל-100 רשומות. שדרג עכשיו כדי לנהל את כל מאגר המתעניינים שלך', {
          duration: 8000,
          action: { label: 'שדרג עכשיו', onClick: () => window.location.assign('/upgrade') },
        });
        return;
      }
    }
    abortRef.current = false;
    setImporting(true);
    setPhase('importing');

    const s: ImportStats = { total: parsed.rows.length, processed: 0, inserted: 0, duplicates: 0, invalidPhones: 0, invalidIds: 0, errors: 0 };
    const flaggedRows: FlaggedRow[] = [];
    const seenPhones = new Set<string>();
    const startTime = Date.now();
    const dataStartRow = 2; // header is row 1 in spreadsheet

    const get = (row: string[], key: FieldKey): string => {
      const idx = fieldIndex[key];
      return idx === undefined ? '' : (row[idx] ?? '');
    };

    const validRows: any[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const rowAsObject = (): Record<string, string> => ({
        identity_number: get(row, 'identity_number'),
        full_name: get(row, 'full_name'),
        phone_number: get(row, 'phone_number'),
        city: get(row, 'city'),
      });
      const rawPhone = get(row, 'phone_number');

      if (!rawPhone || !rawPhone.trim()) {
        s.invalidPhones++;
        flaggedRows.push({ row: i + dataStartRow, reason: 'טלפון ריק', data: rowAsObject() });
        continue;
      }
      const normalized = normalizeIsraeliPhone(rawPhone);
      if (!normalized) {
        s.invalidPhones++;
        flaggedRows.push({ row: i + dataStartRow, reason: 'טלפון לא תקין', data: rowAsObject() });
        continue;
      }
      if (seenPhones.has(normalized)) {
        s.duplicates++;
        flaggedRows.push({ row: i + dataStartRow, reason: 'טלפון כפול בקובץ', data: rowAsObject() });
        continue;
      }
      seenPhones.add(normalized);

      const idVal = get(row, 'identity_number');
      if (idVal && !validateIsraeliId(idVal)) {
        s.invalidIds++;
        flaggedRows.push({ row: i + dataStartRow, reason: 'ת.ז לא תקינה', data: rowAsObject() });
        continue;
      }

      const record: any = { phone_number: normalized, status: 'uploaded' };
      const nameVal = get(row, 'full_name');
      const cityVal = get(row, 'city');
      if (nameVal) record.full_name = nameVal;
      if (idVal) record.identity_number = idVal;
      if (cityVal) record.city = cityVal;
      validRows.push(record);
    }

    const totalChunks = Math.ceil(validRows.length / CHUNK_SIZE) || 1;
    for (let c = 0; c < totalChunks; c++) {
      if (abortRef.current) break;
      const chunk = validRows.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
      if (chunk.length === 0) break;
      const { error } = await supabase.from('leads').upsert(chunk, { onConflict: 'phone_number' });
      if (error) {
        s.errors += chunk.length;
        console.error('Chunk error:', error);
        if (typeof error.message === 'string' && error.message.includes('TRIAL_RECORD_LIMIT')) {
          toast.error('מסלול הניסיון מוגבל ל-100 רשומות. שדרג עכשיו כדי לנהל את כל מאגר המתעניינים שלך', {
            duration: 8000,
            action: { label: 'שדרג עכשיו', onClick: () => window.location.assign('/upgrade') },
          });
          abortRef.current = true;
          break;
        }
      } else {
        s.inserted += chunk.length;
      }
      s.processed = Math.min((c + 1) * CHUNK_SIZE, validRows.length) + (parsed.rows.length - validRows.length);
      const pct = Math.round(((c + 1) / totalChunks) * 100);
      setProgress(pct);
      setStats({ ...s });
      const elapsed = Date.now() - startTime;
      const remaining = (elapsed / (c + 1)) * (totalChunks - c - 1);
      setEta(remaining > 60000 ? `${Math.ceil(remaining / 60000)} דקות` : `${Math.ceil(remaining / 1000)} שניות`);
    }

    s.processed = parsed.rows.length;
    setStats({ ...s });
    setFlagged(flaggedRows);
    setProgress(100);
    setEta('');
    setPhase('done');
    setImporting(false);
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#EAB308', '#F59E0B', '#D97706', '#10B981', '#3B82F6'] });
    toast.success(`הייבוא הסתיים - ${s.inserted.toLocaleString()} רשומות`);
  }, [parsed, fieldIndex, blockDemoAction, trial.isTrial]);

  const reset = () => {
    setPhase('idle');
    setFile(null);
    setParsed(null);
    setStats(null);
    setFlagged([]);
    setProgress(0);
    setPreviewLimit(PREVIEW_INITIAL);
  };

  const progressRadius = 70;
  const circumference = 2 * Math.PI * progressRadius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const previewRows = parsed?.rows.slice(0, previewLimit) ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ייבוא נתונים מאסיבי</h1>
        <p className="text-muted-foreground text-sm">ייבוא קובץ Excel (.xlsx) - שורה ראשונה = כותרות, מיפוי אוטומטי לפי שם הכותרת</p>
      </div>

      {phase === 'idle' && (
        <Card
          className="border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">גרור קובץ Excel לכאן</p>
              <p className="text-sm text-muted-foreground">או לחץ לבחירת קובץ · .xlsx / .xls / .csv · עד 300,000 שורות</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </CardContent>
        </Card>
      )}

      {phase === 'idle' && (
        <DriveImporterPicker onFileFetched={handleFile} />
      )}

      {phase === 'parsed' && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {file?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {parsed.rows.length.toLocaleString()} רשומות
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1">
                {parsed.headers.length} עמודות
              </Badge>
              {fieldIndex.phone_number === undefined && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  חסרה עמודת טלפון
                </Badge>
              )}
            </div>

            {/* Column mapping summary */}
            <div className="space-y-2">
              <p className="font-medium text-foreground text-sm">מיפוי עמודות שזוהה אוטומטית</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parsed.headers.map((h, i) => {
                  const f = parsed.detectedFields[i];
                  const isUnknown = f === 'unknown';
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs ${
                        isUnknown ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-border/60 bg-muted/30'
                      }`}
                    >
                      <span className="truncate font-medium" title={h}>{h || <em className="text-muted-foreground">עמודה {i + 1} ללא כותרת</em>}</span>
                      <span className={`text-[10px] uppercase tracking-wider ${isUnknown ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
                        {isUnknown ? 'תתעלם' : `→ ${FIELD_LABELS[f]}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {unknownHeaders.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs">
                  <HelpCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">יש עמודות שלא זוהו:</p>
                    <p className="text-muted-foreground">
                      {unknownHeaders.join(' · ')}
                    </p>
                    <p className="text-muted-foreground">
                      העמודות האלה יתעלמו בייבוא. אם אחת מהן צריכה להיכנס למערכת (לדוגמה כעיר/שם/טלפון/ת.ז), שנה את שם הכותרת בקובץ או ספר לי איך למפות אותה.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={startImport} size="lg" disabled={fieldIndex.phone_number === undefined}>
                התחל ייבוא
              </Button>
              <Button variant="outline" onClick={reset}>בטל</Button>
            </div>

            {/* Preview */}
            {parsed.rows.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-foreground text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  תצוגה מקדימה - מציג {Math.min(previewLimit, parsed.rows.length).toLocaleString()} מתוך {parsed.rows.length.toLocaleString()} רשומות
                </p>
                <div className="overflow-auto border border-border/50 rounded-lg max-h-[480px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        {parsed.headers.map((h, i) => (
                          <TableHead key={i} className="text-xs whitespace-nowrap">
                            <div className="flex flex-col">
                              <span>{h || `עמודה ${i + 1}`}</span>
                              <span className={`text-[9px] font-normal ${parsed.detectedFields[i] === 'unknown' ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
                                {parsed.detectedFields[i] === 'unknown' ? 'יתעלם' : FIELD_LABELS[parsed.detectedFields[i]]}
                              </span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          {parsed.headers.map((_, ci) => (
                            <TableCell key={ci} className="text-xs whitespace-nowrap">
                              {row[ci] || <span className="text-muted-foreground">-</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {previewLimit < parsed.rows.length && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewLimit((n) => Math.min(n + PREVIEW_STEP, parsed.rows.length))}
                    >
                      טען עוד {Math.min(PREVIEW_STEP, parsed.rows.length - previewLimit)} שורות
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(phase === 'importing' || phase === 'done') && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <svg width="160" height="160" className="transform -rotate-90">
                  <circle cx="80" cy="80" r={progressRadius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle cx="80" cy="80" r={progressRadius} fill="none" stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-300" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-foreground">{progress}%</span>
                  {phase === 'done' && <CheckCircle2 className="h-5 w-5 text-primary mt-1" />}
                </div>
              </div>

              {eta && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="h-4 w-4" />
                  <span>זמן משוער: {eta}</span>
                </div>
              )}

              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-lg">
                  <StatBox label="נוספו" value={stats.inserted} color="text-green-500" />
                  <StatBox label="כפילויות" value={stats.duplicates} color="text-yellow-500" />
                  <StatBox label="טלפון שגוי" value={stats.invalidPhones} color="text-red-500" />
                  <StatBox label="ת.ז שגויה" value={stats.invalidIds} color="text-orange-500" />
                </div>
              )}

              {phase === 'done' && (
                <Button variant="outline" onClick={reset}>ייבוא נוסף</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {flagged.length > 0 && phase === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              שורות שנדחו ({flagged.length.toLocaleString()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto text-sm space-y-1">
              {flagged.slice(0, 200).map((f, i) => (
                <div key={i} className="flex items-center gap-3 py-1 border-b border-border/50">
                  <Badge variant="outline" className="shrink-0">שורה {f.row}</Badge>
                  <span className="text-destructive font-medium">{f.reason}</span>
                  <span className="text-muted-foreground truncate">{Object.values(f.data).slice(0, 3).join(' | ')}</span>
                </div>
              ))}
              {flagged.length > 200 && (
                <p className="text-muted-foreground text-center py-2">ועוד {(flagged.length - 200).toLocaleString()} שורות...</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-muted/50">
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
