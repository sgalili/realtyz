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
import { Upload } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

// Fuzzy header dictionary
const FIELD_ALIASES: Record<string, string[]> = {
  price: ['מחיר', 'עלות', 'מחיר מבוקש', 'price', 'cost'],
  city: ['עיר', 'אזור', 'כתובת', 'שכונה', 'city', 'location', 'address'],
  rooms: ['חדרים', 'מספר חדרים', 'rooms', 'bedrooms'],
  sqm: ['מ"ר', 'מ״ר', 'שטח', 'גודל', 'sqm', 'size', 'area'],
  title: ['כותרת', 'שם', 'title', 'name'],
  description: ['תיאור', 'description', 'desc'],
};

function normalizeKey(s: string) {
  return String(s).trim().toLowerCase().replace(/["'`]/g, '').replace(/\s+/g, ' ');
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

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'listing'
  ) + '-' + Math.random().toString(36).slice(2, 8);
}

export function ImportPropertiesDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);

  const handleFile = async (file: File) => {
    setProcessing(true);
    setSummary(null);
    try {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      let rows: Record<string, any>[];
      if (isPdf) {
        const res = await parsePdfToRows(file);
        rows = res.rows;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }
      if (!rows.length) {
        toast.error('הקובץ ריק');
        return;
      }
      const headerMap = buildHeaderMap(Object.keys(rows[0]));

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        toast.error('יש להתחבר כדי לייבא נכסים');
        return;
      }

      const inserts: any[] = [];
      let skipped = 0;
      for (const row of rows) {
        const mapped: Record<string, any> = {};
        for (const [origKey, field] of Object.entries(headerMap)) {
          mapped[field] = row[origKey];
        }
        const price = parseNumber(mapped.price);
        const city = mapped.city ? String(mapped.city).trim() : '';
        if (!price || !city) {
          skipped++;
          continue;
        }
        const rooms = parseNumber(mapped.rooms);
        const sqm = parseNumber(mapped.sqm);
        const title =
          (mapped.title ? String(mapped.title).trim() : '') ||
          `נכס ב${city}${rooms ? ` · ${rooms} חד'` : ''}`;
        inserts.push({
          user_id: auth.user.id,
          slug: slugify(title),
          property_title: title,
          description: mapped.description ? String(mapped.description) : title,
          asking_price: price,
          city,
          rooms: rooms ?? null,
          sqm: sqm ? Math.round(sqm) : null,
          status: 'live',
          source: 'import',
          is_published: true,
          features: [],
        });
      }

      if (!inserts.length) {
        toast.error('לא נמצאו שורות עם עיר ומחיר תקינים');
        setSummary({ imported: 0, skipped });
        return;
      }

      const { error } = await supabase.from('listings').insert(inserts);
      if (error) throw error;
      toast.success(`יובאו ${inserts.length} נכסים בהצלחה`);
      setSummary({ imported: inserts.length, skipped });
      onImported?.();
    } catch (e: any) {
      toast.error(`שגיאה בייבוא: ${e.message ?? e}`);
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>יבוא נכסים מאקסל</DialogTitle>
          <DialogDescription>
            העלו קובץ Excel או CSV. נזהה את העמודות אוטומטית (מחיר, עיר, חדרים, מ"ר).
            שורות עם עיר ומחיר ייווספו אוטומטית כמאושרות.
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
              disabled={processing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {processing && (
            <div className="text-sm text-center text-muted-foreground">מעבד את הקובץ...</div>
          )}

          {summary && (
            <div className="text-sm bg-muted/40 rounded-lg p-3 space-y-1">
              <div>נוספו: <strong>{summary.imported}</strong> נכסים</div>
              {summary.skipped > 0 && (
                <div className="text-muted-foreground">דולגו: {summary.skipped} (חסר עיר או מחיר)</div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
