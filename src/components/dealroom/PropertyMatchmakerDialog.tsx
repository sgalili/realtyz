import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import {
  Search,
  Home,
  MapPin,
  BedDouble,
  Ruler,
  Sparkles,
  ImageOff,
  ArrowLeft,
  Send,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type PropertyResult = {
  id: string;
  source: 'homely' | 'listings';
  title: string;
  description: string;
  price: number | null;
  currency: string;
  city: string | null;
  rooms: number | null;
  size_sqm: number | null;
  photos: string[];
  url: string | null;
  features: string[];
};

type Prospect = {
  id: string;
  full_name: string | null;
  city?: string | null;
  interest_tag?: string | null;
};

type Filters = {
  min_price: string;
  max_price: string;
  city: string;
  rooms: string;
  keywords: string;
};

const EMPTY_FILTERS: Filters = {
  min_price: '',
  max_price: '',
  city: '',
  rooms: '',
  keywords: '',
};

function formatPrice(price: number | null, currency = '₪') {
  if (!price) return '—';
  return `${currency}${Number(price).toLocaleString('he-IL')}`;
}

export function PropertyMatchmakerDialog({
  open,
  onOpenChange,
  prospect,
  onShareDraft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: Prospect | null;
  /** Called when the agent confirms "Share with Prospect" — receives the AI draft. */
  onShareDraft: (args: { draft: string; property: PropertyResult }) => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<PropertyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'homely' | 'listings' | null>(null);
  const [selected, setSelected] = useState<PropertyResult | null>(null);
  const [drafting, setDrafting] = useState(false);

  // Pre-fill filters from prospect each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setResults([]);
    setSource(null);
    setFilters({
      ...EMPTY_FILTERS,
      city: prospect?.city || '',
      keywords: prospect?.interest_tag || '',
    });
    // Auto-run an initial search if we have a prospect
    if (prospect) {
      void runSearch({ ...EMPTY_FILTERS, city: prospect.city || '', keywords: prospect.interest_tag || '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prospect?.id]);

  async function runSearch(f: Filters) {
    setLoading(true);
    setSelected(null);
    try {
      const body: Record<string, unknown> = { prospect_id: prospect?.id };
      if (f.min_price) body.min_price = Number(f.min_price);
      if (f.max_price) body.max_price = Number(f.max_price);
      if (f.city.trim()) body.city = f.city.trim();
      if (f.rooms) body.rooms = Number(f.rooms);
      if (f.keywords.trim()) body.keywords = f.keywords.trim();
      body.limit = 18;

      const { data, error } = await supabase.functions.invoke('homely-search', { body });
      if (error) throw error;
      const res = (data as any)?.results || [];
      setResults(res as PropertyResult[]);
      setSource(((data as any)?.source as 'homely' | 'listings') || null);
      if (res.length === 0) {
        toast.info('לא נמצאו נכסים שתואמים לפילטרים', {
          description: 'נסו להרחיב את טווח המחירים או להסיר את העיר.',
        });
      }
    } catch (e: any) {
      console.error('homely-search failed', e);
      toast.error('חיפוש הנכסים נכשל', { description: e?.message });
    } finally {
      setLoading(false);
    }
  }

  async function shareWithProspect() {
    if (!selected || !prospect) return;
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke('draft-property-share', {
        body: { prospect_id: prospect.id, property: selected },
      });
      if (error) throw error;
      const draft = (data as any)?.draft as string;
      if (!draft) throw new Error('ה-AI החזיר טיוטה ריקה');
      onShareDraft({ draft, property: selected });
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || 'יצירת הטיוטה נכשלה';
      if (/402/.test(msg)) {
        toast.error('קרדיטי AI נגמרו', { description: 'הוסיפו אשראי בסביבת העבודה ← שימוש.' });
      } else if (/429/.test(msg)) {
        toast.error('הגעתם למגבלת קצב של ה-AI', { description: 'נסו שוב עוד רגע.' });
      } else {
        toast.error('יצירת הודעת השיתוף נכשלה', { description: msg });
      }
    } finally {
      setDrafting(false);
    }
  }

  const headerSubtitle = useMemo(() => {
    if (!prospect) return 'בחרו לקוח תחילה';
    return `עבור ${prospect.full_name || 'הלקוח'}${prospect.city ? ` · ${prospect.city}` : ''}`;
  }, [prospect]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            התאמת נכסים חכמה
            {source && (
              <Badge variant="outline" className="ml-2 text-[10px] uppercase tracking-wide">
                {source === 'homely' ? 'Homely' : 'נכסים מקומיים'}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{headerSubtitle}</DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Filters + results ── */}
        {!selected && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-6 py-4 border-b bg-muted/30">
              <FilterField label="מחיר מינ' (₪)">
                <Input type="number" inputMode="numeric" value={filters.min_price}
                  onChange={(e) => setFilters((p) => ({ ...p, min_price: e.target.value }))}
                  placeholder="1,500,000" />
              </FilterField>
              <FilterField label="מחיר מקס' (₪)">
                <Input type="number" inputMode="numeric" value={filters.max_price}
                  onChange={(e) => setFilters((p) => ({ ...p, max_price: e.target.value }))}
                  placeholder="3,000,000" />
              </FilterField>
              <FilterField label="עיר / אזור">
                <Input value={filters.city}
                  onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
                  placeholder="תל אביב" />
              </FilterField>
              <FilterField label="חדרים מינ'">
                <Input type="number" inputMode="numeric" value={filters.rooms}
                  onChange={(e) => setFilters((p) => ({ ...p, rooms: e.target.value }))}
                  placeholder="3" />
              </FilterField>
              <FilterField label="מילות מפתח">
                <Input value={filters.keywords}
                  onChange={(e) => setFilters((p) => ({ ...p, keywords: e.target.value }))}
                  placeholder="גינה, מרפסת…" />
              </FilterField>
              <div className="col-span-2 sm:col-span-5 flex justify-end">
                <Button onClick={() => runSearch(filters)} disabled={loading} size="sm" className="gap-1.5">
                  {loading ? (<Loader2 className="h-4 w-4 animate-spin" />) : (<Search className="h-4 w-4" />)}
                  חיפוש
                </Button>
              </div>
            </div>

            <ScrollArea className="max-h-[55vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-6">
                {loading && Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-48 w-full rounded-lg" />))}
                {!loading && results.length === 0 && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-12">
                    אין נכסים עדיין — עדכנו את הפילטרים מעל וחפשו.
                  </div>
                )}
                {!loading && results.map((r) => (
                  <PropertyCard key={`${r.source}-${r.id}`} property={r} onSelect={() => setSelected(r)} />
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {/* ── Step 2: Snippet preview + Share ── */}
        {selected && (
          <div className="p-6 space-y-4">
            <Button variant="ghost" size="sm" className="gap-1.5 -mr-2" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" />
              חזרה לתוצאות
            </Button>

            <PropertySnippet property={selected} />

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                בחירת נכס אחר
              </Button>
              <Button onClick={shareWithProspect} disabled={drafting || !prospect} className="gap-1.5">
                {drafting ? (
                  <><Sparkles className="h-4 w-4 animate-pulse" />מנסח הודעה אישית…</>
                ) : (
                  <><Send className="h-4 w-4" />שיתוף עם הלקוח</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PropertyCard({
  property,
  onSelect,
}: {
  property: PropertyResult;
  onSelect: () => void;
}) {
  const photo = property.photos?.[0];
  return (
    <Card
      className="overflow-hidden hover:shadow-md transition cursor-pointer group"
      onClick={onSelect}
    >
      <div className="relative aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
        ) : (
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        )}
        <Badge className="absolute top-2 right-2 bg-background/90 text-foreground border">
          {formatPrice(property.price, property.currency)}
        </Badge>
      </div>
      <div className="p-3 space-y-1">
        <h4 className="font-medium text-sm line-clamp-1">{property.title}</h4>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {property.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {property.city}
            </span>
          )}
          {property.rooms != null && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3 w-3" />
              {property.rooms}
            </span>
          )}
          {property.size_sqm != null && (
            <span className="inline-flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              {property.size_sqm}m²
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Property Snippet card — also exported for reuse inside the chat draft preview. */
export function PropertySnippet({ property }: { property: PropertyResult }) {
  return (
    <div className={cn(
      'rounded-lg border bg-card overflow-hidden',
    )}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
        <div className="sm:col-span-1 aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
          {property.photos?.[0] ? (
            <img
              src={property.photos[0]}
              alt={property.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageOff className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
        <div className="sm:col-span-2 p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-base">{property.title}</h3>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {property.source === 'homely' ? 'Homely' : 'Listing'}
            </Badge>
          </div>
          <div className="text-2xl font-bold text-primary">
            {formatPrice(property.price, property.currency)}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {property.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {property.city}
              </span>
            )}
            {property.rooms != null && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" />
                {property.rooms} rooms
              </span>
            )}
            {property.size_sqm != null && (
              <span className="inline-flex items-center gap-1">
                <Ruler className="h-3.5 w-3.5" />
                {property.size_sqm}m²
              </span>
            )}
          </div>
          {property.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {property.description}
            </p>
          )}
          {property.photos.length > 1 && (
            <div className="flex gap-1.5 pt-1 overflow-x-auto">
              {property.photos.slice(1, 5).map((p, i) => (
                <img
                  key={i}
                  src={p}
                  alt=""
                  className="h-12 w-16 object-cover rounded border shrink-0"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
