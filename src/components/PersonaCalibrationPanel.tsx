import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, Sparkles, FlaskConical, FileText, X, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

// pdfjs-dist worker setup (browser-only)
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - vite worker import
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = PdfWorker;

interface StyleCalibration {
  summary?: string | null;
  sentence_length?: string | null;
  emoji_usage?: string | null;
  language_mix?: string | null;
  common_openings?: string[];
  common_closings?: string[];
  signature_phrases?: string[];
  punctuation_habits?: string | null;
  formality?: number | null;
  directness?: number | null;
  warmth?: number | null;
  do_say?: string[];
  dont_say?: string[];
  sources?: string[];
}

interface CalibrationRow {
  style_calibration: StyleCalibration | null;
  style_calibration_updated_at: string | null;
}

const MAX_FILES = 5;
const MAX_SIZE_MB = 10;

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const buf = await file.arrayBuffer();
    const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
    let text = '';
    const maxPages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: any) => it.str).join(' ');
      text += pageText + '\n';
    }
    return text;
  }
  // txt / chat exports
  return await file.text();
}

export function PersonaCalibrationPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [enquiry, setEnquiry] = useState('');
  const [leadName, setLeadName] = useState('מיכל');
  const [simReply, setSimReply] = useState<string | null>(null);

  const { data: row, isLoading } = useQuery({
    queryKey: ['agent-persona-calibration', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_personas')
        .select('style_calibration, style_calibration_updated_at')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as CalibrationRow | null) ?? { style_calibration: null, style_calibration_updated_at: null };
    },
  });

  const cal: StyleCalibration | null = row?.style_calibration ?? null;

  const calibrate = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error('יש להעלות לפחות קובץ אחד');
      const samples: Array<{ name: string; text: string }> = [];
      for (const f of files) {
        try {
          const text = await extractTextFromFile(f);
          if (text.trim()) samples.push({ name: f.name, text });
        } catch (e) {
          console.warn('extract failed for', f.name, e);
          toast.error(`לא הצלחתי לקרוא את ${f.name}`);
        }
      }
      if (samples.length === 0) throw new Error('לא נמצא טקסט שמיש בקבצים');

      const { data, error } = await supabase.functions.invoke('calibrate-persona-style', {
        body: { samples },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('פרופיל הסגנון נלמד והוטמע ב-AI');
      setFiles([]);
      qc.invalidateQueries({ queryKey: ['agent-persona-calibration', user?.id] });
    },
    onError: (e: any) => toast.error(e?.message || 'הכיול נכשל'),
  });

  const simulate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('simulate-lead-enquiry', {
        body: { enquiry: enquiry.trim() || undefined, lead_name: leadName.trim() || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { reply: string; calibration_present: boolean };
    },
    onSuccess: (data) => {
      setSimReply(data.reply);
      if (!data.calibration_present) {
        toast.message('הסימולציה רצה ללא כיול סגנון, מומלץ להעלות שיחות קודם.');
      }
    },
    onError: (e: any) => toast.error(e?.message || 'הסימולציה נכשלה'),
  });

  const onPickFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next: File[] = [...files];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) break;
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name} חורג מ-${MAX_SIZE_MB}MB`);
        continue;
      }
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      const isTxt = f.type.startsWith('text/') || /\.(txt|md|log|csv)$/i.test(f.name);
      if (!isPdf && !isTxt) {
        toast.error(`סוג קובץ לא נתמך: ${f.name}`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  };

  return (
    <Card dir="rtl" className="border-primary/20">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-primary" />
          AI Fine-Tuning · כיול הסגנון של הסוכן
        </CardTitle>
        <CardDescription className="text-xs">
          העלה ייצואים של שיחות WhatsApp או מיילים אמיתיים שלך (PDF / TXT). ה-AI ילמד את אורך המשפטים, האימוג'ים, פתיחים, סגירות וביטויי החתימה שלך, וישכפל את הסגנון בכל הודעה ללקוח.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Upload */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold">יומני תקשורת של הסוכן</Label>

          <div
            className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-center text-xs text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPickFiles(e.dataTransfer.files); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.log,.csv,application/pdf,text/plain"
              multiple
              hidden
              onChange={(e) => { onPickFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value=''; }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_FILES}
              className="gap-1.5"
            >
              <Upload className="h-4 w-4" /> בחר קבצים
            </Button>
            <p className="mt-2">PDF / TXT עד {MAX_SIZE_MB}MB · עד {MAX_FILES} קבצים</p>
          </div>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded border border-border bg-muted/40 px-2 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground">({(f.size/1024).toFixed(0)} KB)</span>
                  </span>
                  <button
                    type="button"
                    aria-label="הסר קובץ"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => calibrate.mutate()}
              disabled={files.length === 0 || calibrate.isPending}
              className="gap-1.5 h-10"
            >
              {calibrate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              למד את הסגנון שלי
            </Button>
          </div>
        </div>

        {/* Current calibration */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">פרופיל סגנון נוכחי</Label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> טוען...
            </div>
          ) : !cal ? (
            <p className="text-xs text-muted-foreground">עוד לא בוצע כיול. העלה שיחות והפעל את הכפתור למעלה.</p>
          ) : (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-[12px] leading-relaxed space-y-2">
              {cal.summary && <p className="text-foreground/90">{cal.summary}</p>}
              <div className="flex flex-wrap gap-1.5">
                {cal.sentence_length && <Badge variant="outline">משפטים: {cal.sentence_length}</Badge>}
                {cal.emoji_usage && <Badge variant="outline">אימוג'ים: {cal.emoji_usage}</Badge>}
                {cal.language_mix && <Badge variant="outline">שפה: {cal.language_mix}</Badge>}
                {typeof cal.formality === 'number' && <Badge variant="outline">פורמליות: {cal.formality}/5</Badge>}
                {typeof cal.directness === 'number' && <Badge variant="outline">ישירות: {cal.directness}/5</Badge>}
                {typeof cal.warmth === 'number' && <Badge variant="outline">חמימות: {cal.warmth}/5</Badge>}
              </div>
              {cal.signature_phrases && cal.signature_phrases.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground">ביטויי חתימה:</p>
                  <p className="text-[12px]">{cal.signature_phrases.slice(0,8).map((s) => `"${s}"`).join(', ')}</p>
                </div>
              )}
              {cal.common_openings && cal.common_openings.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground">פתיחים נפוצים:</p>
                  <p className="text-[12px]">{cal.common_openings.slice(0,5).map((s) => `"${s}"`).join(', ')}</p>
                </div>
              )}
              {row?.style_calibration_updated_at && (
                <p className="text-[10px] text-muted-foreground text-left">
                  עודכן: {new Date(row.style_calibration_updated_at).toLocaleString('he-IL')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Persona Calibration Test */}
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <Label className="text-xs font-semibold">בדיקת כיול פרסונה</Label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            לחיצה תפעיל סימולציה של פניית מתעניין חדש ותחזיר את הניסוח שה-AI היה שולח, כדי שתוכל לאשר אותו לפני שהוא יוצא בפועל.
          </p>

          <div className="grid gap-2">
            <Input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="שם המתעניין (לסימולציה)"
              maxLength={60}
              className="h-9 text-sm"
            />
            <Textarea
              value={enquiry}
              onChange={(e) => setEnquiry(e.target.value)}
              placeholder="טקסט הפנייה (אופציונלי). אם תשאיר ריק, תופעל פנייה לדוגמה על דירת 4 חדרים, מחיר וחניה."
              className="min-h-[80px] text-sm"
              maxLength={1500}
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => simulate.mutate()}
              disabled={simulate.isPending}
              className="h-10 gap-1.5"
            >
              {simulate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              הרץ סימולציה
            </Button>
          </div>

          {simReply !== null && (
            <div className="rounded-md border border-primary/30 bg-background p-3">
              <Badge variant="outline" className="mb-2 border-primary/40 text-primary">תשובת ה-AI לסימולציה</Badge>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground">{simReply}</pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PersonaCalibrationPanel;
