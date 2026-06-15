import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { parsePdfToRows } from '@/lib/parsePdfTable';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, CheckCircle2, AlertCircle, Copy } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

// Bilingual fuzzy header dictionary → canonical field name
const FIELD_ALIASES: Record<string, string[]> = {
  price:        ['מחיר', 'עלות', 'מחיר מבוקש', 'price', 'cost', 'asking price'],
  city:         ['עיר', 'יישוב', 'ישוב', 'city', 'location'],
  neighborhood: ['שכונה', 'אזור', 'אז', 'neighborhood', 'area'],
  rooms:        ['חדר', 'חדרים', 'מספר חדרים', 'rooms', 'bedrooms'],
  sqm:          ['מ"ר', 'מ״ר', 'מר', 'שטח', 'גודל', 'sqm', 'size', 'area sqm'],
  title:        ['כותרת', 'שם נכס', 'סוג נכס', 'title', 'property title'],
  property_type:['נכס', 'סוג הנכס', 'property type', 'type'],
  description:  ['תיאור', 'description', 'desc', 'הערות', 'notes'],
  street:       ['רחוב', 'כתובת', 'street', 'address'],
  street_no:    ['מס', 'מספר', 'מס בית', 'street number', 'no'],
  floor:        ['קו', 'קומה', 'floor'],
  elevator:     ['מע', 'מעלית', 'elevator', 'lift'],
  parking:      ['חניה', 'חנייה', 'parking'],
  owner_name:   ['שם', 'שם בעלים', 'owner', 'בעלים', 'first name'],
  owner_family: ['משפחה', 'שם משפחה', 'family', 'last name'],
  owner_phone:  ['טלפון', 'טלפון1', 'טלפון 1', 'נייד', 'סלולרי', 'phone', 'mobile'],
  agent:        ['סוכן', 'agent', 'broker'],
  serial:       ['סדורי', 'סידורי', 'מספר סידורי', 'serial', 'serial number'],
  opened_at:    ['פתיחה', 'נפתח', 'opened', 'opened at'],
  updated_at_src:['עדכון', 'עודכן', 'updated', 'updated at'],
  listing_type: ['עסקה', 'סוג עסקה', 'מצב', 'deal', 'deal type', 'listing type'],
  project_name: ['פרוייקט', 'פרויקט', 'project', 'project name', 'שם פרויקט'],
  apt_number:   ['מספר דירה', 'מס דירה', 'דירה', 'apt', 'apartment', 'apartment number', 'unit', 'unit number'],
  apt_model:    ['טיפוס', 'דגם', 'טיפוס דירה', 'דגם דירה', 'טיפוס/דגם', 'טיפוס/דגם דירה', 'model', 'type model'],
};

function detectListingType(extras: Record<string, string>, mappedListingType: any, price: number | null): 'sale' | 'rent' {
  const explicit = mappedListingType ? String(mappedListingType).toLowerCase() : '';
  if (/השכר|שכיר|rent|להשכרה/i.test(explicit)) return 'rent';
  if (/מכיר|sale|למכירה/i.test(explicit)) return 'sale';
  const blob = Object.entries(extras).map(([k, v]) => `${k} ${v}`).join(' ');
  if (/השכר|שכיר|להשכרה|rent/i.test(blob)) return 'rent';
  if (/למכירה|מכירה|sale/i.test(blob)) return 'sale';
  if (price != null && price > 0) return price >= 1_000_000 ? 'sale' : 'rent';
  return 'sale';
}

function normalizeKey(s: string) {
  return String(s ?? '').trim().toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function buildHeaderMap(headers: string[]) {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const norm = normalizeKey(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalizeKey(a) === norm)) {
        map[h] = field;
        break;
      }
    }
  }
  return map;
}

function parseNumber(v: any): number | null {
  if (v == null || v === '') return null;
  const cleaned = String(v).replace(/[₪,\s]/g, '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

function parseBool(v: any): boolean | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (['כן', 'יש', 'true', '1', 'yes', 'y', 'v'].includes(s)) return true;
  if (['לא', 'אין', 'false', '0', 'no', 'n'].includes(s)) return false;
  if (/כן|יש|yes/.test(s)) return true;
  if (/לא|אין|no/.test(s)) return false;
  return null;
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'listing'
  ) + '-' + Math.random().toString(36).slice(2, 8);
}

// Stable fingerprint used to detect duplicates inside the file and vs the DB.
// For project rows (multi-unit developments), distinct units share the same address/project,
// so we identify duplicates by apartment number + floor instead.
function fingerprintInsert(ins: any): string {
  const norm = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const meta = ins.source_metadata || {};
  const project = norm(ins.project_name ?? meta.project_name);
  const aptNumber = norm(meta.apt_number);
  const floor = norm(ins.floor);

  if (project && (aptNumber || floor)) {
    // Project-scoped fingerprint: unit number + floor uniquely identifies a sibling unit
    return ['project', project, aptNumber, floor].join('|');
  }

  const parts = [
    norm(ins.city),
    norm(ins.address),
    norm(ins.rooms),
    norm(Math.round(Number(ins.asking_price ?? 0))),
    norm(ins.property_title),
    aptNumber,
    floor,
  ];
  return parts.join('|');
}

type Stats = {
  totalRows: number;
  emptySkipped: number;
  fileDuplicates: number;
  dbDuplicates: number;
  toImport: number;
};

export function ImportPropertiesDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingInserts, setPendingInserts] = useState<any[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const runOcrFallback = async (file: File): Promise<Record<string, any>[]> => {
    setOcrRunning(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { data, error } = await supabase.functions.invoke('extract-pdf-properties', {
        body: { file_data_url: dataUrl, file_name: file.name },
      });
      if (error) throw error;
      return (data?.rows ?? []) as Record<string, any>[];
    } finally {
      setOcrRunning(false);
    }
  };

  const rowsLookEmpty = (rows: Record<string, any>[]): boolean => {
    if (!rows.length) return true;
    const useful = rows.filter((r) =>
      Object.values(r).some((v) => v != null && String(v).trim().replace(/\s+/g, '').length >= 2),
    );
    return useful.length === 0;
  };

  const resetPreview = () => {
    setPendingInserts(null);
    setStats(null);
    setSummary(null);
  };

  const handleFile = async (file: File) => {
    setProcessing(true);
    resetPreview();
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      let rows: Record<string, any>[];
      if (isPdf) {
        const res = await parsePdfToRows(file);
        rows = res.rows;
        if (rowsLookEmpty(rows)) {
          rows = await runOcrFallback(file);
        }
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }
      if (!rows.length) {
        toast.error('לא ניתן היה לחלץ נתונים מהקובץ. ודאו שה-PDF מכיל טבלה קריאה.');
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        toast.error('יש להתחבר כדי לייבא נכסים');
        return;
      }

      const buildInserts = (sourceRows: Record<string, any>[]) => {
        if (!sourceRows.length) return { inserts: [] as any[], skipped: 0 };
        const headerMap = buildHeaderMap(Object.keys(sourceRows[0]));
        const inserts: any[] = [];
        let skipped = 0;
        for (const row of sourceRows) {
          const mapped: Record<string, any> = {};
          const extras: Record<string, string> = {};
          for (const [origKey, val] of Object.entries(row)) {
            const field = headerMap[origKey];
            if (field) mapped[field] = val;
            const sv = val == null ? '' : String(val).trim();
            if (sv) extras[origKey] = sv;
          }

          const price = parseNumber(mapped.price);
          const street = mapped.street ? String(mapped.street).trim() : '';
          const streetNo = mapped.street_no ? String(mapped.street_no).trim() : '';
          const address = [street, streetNo].filter(Boolean).join(' ').trim();
          const propertyType = mapped.property_type ? String(mapped.property_type).trim() : '';
          const city = mapped.city ? String(mapped.city).trim() : '';
          const neighborhood = mapped.neighborhood ? String(mapped.neighborhood).trim() : '';
          const rooms = parseNumber(mapped.rooms);
          const sqm = parseNumber(mapped.sqm);
          const floor = parseNumber(mapped.floor);
          const elevator = parseBool(mapped.elevator);
          const parking = parseBool(mapped.parking);

          if (!price && !address && !propertyType) {
            skipped++;
            continue;
          }

          const projectName = mapped.project_name ? String(mapped.project_name).trim() : '';
          const aptNumber = mapped.apt_number != null && mapped.apt_number !== ''
            ? String(mapped.apt_number).trim() : '';
          const aptModel = mapped.apt_model ? String(mapped.apt_model).trim() : '';

          const titleFromHeader = mapped.title ? String(mapped.title).trim() : '';
          const title =
            titleFromHeader ||
            [
              projectName || propertyType || 'נכס',
              aptNumber && `דירה ${aptNumber}`,
              aptModel && `(${aptModel})`,
              address && `· ${address}`,
              rooms && `· ${rooms} חד'`,
            ]
              .filter(Boolean)
              .join(' ');

          const ownerName = [mapped.owner_name, mapped.owner_family]
            .filter(Boolean).map((s) => String(s).trim()).join(' ').trim();

          inserts.push({
            user_id: auth.user.id,
            slug: slugify(title),
            property_title: title,
            description: mapped.description ? String(mapped.description) : title,
            asking_price: price ?? 0,
            city: city || null,
            neighborhood: neighborhood || null,
            address: address || null,
            rooms: rooms ?? null,
            sqm: sqm ? Math.round(sqm) : null,
            floor: floor != null ? Math.round(floor) : null,
            elevator,
            parking,
            project_name: projectName || null,
            status: 'live',
            source: 'import',
            is_published: true,
            features: [
              ...(propertyType ? [propertyType] : []),
              ...(aptModel ? [{ apt_model: aptModel }] : []),
              { listing_type: detectListingType(extras, mapped.listing_type, price) },
            ],
            source_metadata: {
              owner_name: ownerName || null,
              owner_phone: mapped.owner_phone ? String(mapped.owner_phone).trim() : null,
              agent: mapped.agent ? String(mapped.agent).trim() : null,
              serial: mapped.serial ? String(mapped.serial).trim() : null,
              opened_at: mapped.opened_at ? String(mapped.opened_at).trim() : null,
              updated_at_src: mapped.updated_at_src ? String(mapped.updated_at_src).trim() : null,
              property_type: propertyType || null,
              project_name: projectName || null,
              apt_number: aptNumber || null,
              apt_model: aptModel || null,
              extras,
            },
          });
        }
        return { inserts, skipped };
      };

      let { inserts, skipped } = buildInserts(rows);

      if (isPdf && !inserts.length) {
        const ocrRows = await runOcrFallback(file);
        if (ocrRows.length) {
          rows = ocrRows;
          ({ inserts, skipped } = buildInserts(ocrRows));
        }
      }

      const totalRows = rows.length;

      if (!inserts.length) {
        toast.error('לא נמצאו שורות לייבוא');
        setStats({ totalRows, emptySkipped: skipped, fileDuplicates: 0, dbDuplicates: 0, toImport: 0 });
        return;
      }

      // Dedupe inside the file
      const seen = new Set<string>();
      const fileUnique: any[] = [];
      let fileDuplicates = 0;
      for (const ins of inserts) {
        const fp = fingerprintInsert(ins);
        if (seen.has(fp)) { fileDuplicates++; continue; }
        seen.add(fp);
        fileUnique.push(ins);
      }

      // Dedupe against existing DB rows for this user
      const { data: existing } = await supabase
        .from('listings')
        .select('city,address,rooms,asking_price,property_title')
        .eq('user_id', auth.user.id);
      const dbFps = new Set<string>((existing ?? []).map((r: any) => fingerprintInsert(r)));
      const finalInserts: any[] = [];
      let dbDuplicates = 0;
      for (const ins of fileUnique) {
        if (dbFps.has(fingerprintInsert(ins))) { dbDuplicates++; continue; }
        finalInserts.push(ins);
      }

      setPendingInserts(finalInserts);
      setStats({
        totalRows,
        emptySkipped: skipped,
        fileDuplicates,
        dbDuplicates,
        toImport: finalInserts.length,
      });
    } catch (e: any) {
      toast.error(`שגיאה בייבוא: ${e.message ?? e}`);
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pendingInserts?.length) return;
    setImporting(true);
    try {
      const { error } = await supabase.from('listings').insert(pendingInserts);
      if (error) throw error;
      toast.success(`יובאו ${pendingInserts.length} נכסים בהצלחה`);
      setSummary({ imported: pendingInserts.length, skipped: stats?.emptySkipped ?? 0 });
      setPendingInserts(null);
      setStats(null);
      onImported?.();
    } catch (e: any) {
      toast.error(`שגיאה בשמירה: ${e.message ?? e}`);
    } finally {
      setImporting(false);
    }
  };

  const cancelPreview = () => resetPreview();

  const showPreview = !!stats && !summary;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetPreview(); onOpenChange(v); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>יבוא נכסים מאקסל / PDF</DialogTitle>
            <DialogDescription>
              העלו קובץ Excel, CSV או PDF. נזהה אוטומטית את כל העמודות ונסיר כפילויות לפני הייבוא.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary/30 rounded-xl p-8 cursor-pointer hover:bg-muted/40 transition-colors"
            >
              <Upload className="h-8 w-8 text-primary" />
              <span className="text-sm font-semibold">לחצו לבחירת קובץ</span>
              <span className="text-xs text-muted-foreground">.xlsx, .xls, .csv, .pdf</span>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                disabled={processing || importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>

            {processing && (
              <div className={`text-sm text-center rounded-lg p-3 ${ocrRunning ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'}`}>
                {ocrRunning
                  ? 'מפענח קובץ סרוק באמצעות בינה מלאכותית, אנא המתן...'
                  : 'מעבד את הקובץ...'}
              </div>
            )}

            {summary && (
              <div className="text-sm bg-muted/40 rounded-lg p-3 space-y-1">
                <div>נוספו: <strong>{summary.imported}</strong> נכסים</div>
                {summary.skipped > 0 && (
                  <div className="text-muted-foreground">דולגו: {summary.skipped} שורות ריקות</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing || importing}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog with parsed statistics */}
      <Dialog open={showPreview} onOpenChange={(v) => { if (!v) cancelPreview(); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>אישור ייבוא נכסים</DialogTitle>
            <DialogDescription>
              להלן סיכום הקובץ. כפילויות זוהו אוטומטית והוסרו. אשרו כדי לייבא רק את הרשומות הייחודיות.
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="space-y-2 text-sm">
              <StatRow label="סך שורות בקובץ" value={stats.totalRows} />
              <StatRow label="שורות ריקות שדולגו" value={stats.emptySkipped} muted />
              <StatRow
                label="כפילויות בתוך הקובץ"
                value={stats.fileDuplicates}
                icon={<Copy className="h-4 w-4" />}
                muted
              />
              <StatRow
                label="כפילויות מול נכסים קיימים"
                value={stats.dbDuplicates}
                icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
                muted
              />
              <div className="h-px bg-border my-2" />
              <StatRow
                label="מוכן לייבוא"
                value={stats.toImport}
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                strong
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelPreview} disabled={importing}>
              ביטול
            </Button>
            <Button
              onClick={confirmImport}
              disabled={importing || !pendingInserts?.length}
            >
              {importing ? 'מייבא...' : `אשר ייבוא ${stats?.toImport ?? 0} נכסים`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatRow({
  label,
  value,
  icon,
  muted,
  strong,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${strong ? 'bg-primary/10' : 'bg-muted/40'}`}>
      <div className={`flex items-center gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
        {icon}
        <span>{label}</span>
      </div>
      <span className={strong ? 'font-bold text-primary text-base' : 'font-semibold'}>{value}</span>
    </div>
  );
}
