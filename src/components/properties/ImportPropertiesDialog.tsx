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
};

function detectListingType(extras: Record<string, string>, mappedListingType: any, price: number | null): 'sale' | 'rent' {
  const explicit = mappedListingType ? String(mappedListingType).toLowerCase() : '';
  if (/השכר|שכיר|rent|להשכרה/i.test(explicit)) return 'rent';
  if (/מכיר|sale|למכירה/i.test(explicit)) return 'sale';
  const blob = Object.entries(extras).map(([k, v]) => `${k} ${v}`).join(' ');
  if (/השכר|שכיר|להשכרה|rent/i.test(blob)) return 'rent';
  if (/למכירה|מכירה|sale/i.test(blob)) return 'sale';
  // Heuristic: monthly rent prices typically < 30,000
  if (price != null && price > 0 && price < 30000) return 'rent';
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
  // partial matches (e.g. "כן,שתיים")
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
        const extras: Record<string, string> = {};
        for (const [origKey, val] of Object.entries(row)) {
          const field = headerMap[origKey];
          if (field) mapped[field] = val;
          // Preserve EVERY original column verbatim
          const sv = val == null ? '' : String(val).trim();
          if (sv) extras[origKey] = sv;
        }

        const price = parseNumber(mapped.price);
        // Require only a price OR a title/street so we don't drop rows just because city is missing
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

        const titleFromHeader = mapped.title ? String(mapped.title).trim() : '';
        const title =
          titleFromHeader ||
          [propertyType || 'נכס', address && `· ${address}`, rooms && `· ${rooms} חד'`]
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
          status: 'live',
          source: 'import',
          is_published: true,
          features: [
            ...(propertyType ? [propertyType] : []),
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
            extras,
          },
        });
      }

      if (!inserts.length) {
        toast.error('לא נמצאו שורות לייבוא');
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
          <DialogTitle>יבוא נכסים מאקסל / PDF</DialogTitle>
          <DialogDescription>
            העלו קובץ Excel, CSV או PDF. נזהה אוטומטית את כל העמודות: מחיר, נכס, חדרים, רחוב, מס, קומה, מעלית, חניה, פתיחה, עדכון, בעלים, סוכן ועוד. כל עמודה מהקובץ נשמרת כפי שהיא.
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
                <div className="text-muted-foreground">דולגו: {summary.skipped} שורות ריקות</div>
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
