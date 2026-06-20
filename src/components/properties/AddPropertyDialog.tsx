import { useState, useEffect, useRef } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PROPERTY_TYPE_LABELS_HE, type PropertyType, type HomelyProperty } from '@/lib/homelyMockProperties';
import { PropertyDetailView } from './PropertyDetailView';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  initialText?: string;
  autoHydrate?: boolean;
  defaultSource?: 'manual' | 'yad2' | 'madlan';
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

type ParsedListing = {
  listing_type: 'sale' | 'rent';
  property_type: PropertyType | string;
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
  price: number | null;
  sqm: number | null;
  floor: number | null;
  total_floors?: number | null;
  year_built?: number | null;
  address?: string | null;
  description: string | null;
  photos: string[];
  source_url: string | null;
  parking?: number | null;
  air_conditioning?: boolean;
  solar_heater?: boolean;
  shelter?: boolean;
  elevator?: boolean;
};

export function AddPropertyDialog({ open, onOpenChange, onCreated, initialText, autoHydrate, defaultSource }: Props) {
  const [aiText, setAiText] = useState('');
  const [hydrating, setHydrating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [parsed, setParsed] = useState<ParsedListing | null>(null);
  const autoFiredRef = useRef<string | null>(null);

  const reset = () => {
    setAiText('');
    setParsed(null);
    autoFiredRef.current = null;
  };

  const handleHydrate = async (textOverride?: string) => {
    const inputText = (textOverride ?? aiText).trim();
    if (inputText.length < 5) {
      toast.error('הדבק טקסט או קישור');
      return;
    }
    setHydrating(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-listing-text', {
        body: { text: inputText },
      });
      if (error) throw error;
      if (data && data.ok === false && data.fallback) {
        toast.error(
          data.message ||
            'חסימת אבטחה של המקור מנעה משיכה אוטומטית. אנא העתק את הטקסט של המודעה עצמה והדבק אותו כאן במקום הקישור!',
          { duration: 9000 }
        );
        return;
      }
      if (!data?.ok || !data?.data) throw new Error(data?.error || 'parse_failed');
      const d = data.data as ParsedListing;
      // Source URL fallback: prefer parser, then raw URL input, then any yad2/madlan link found in pasted text.
      const urlMatch = inputText.match(/https?:\/\/(?:www\.)?(?:yad2|madlan)\.co\.il\/[^\s"'<>)\]]+/i)
        || inputText.match(/https?:\/\/[^\s"'<>)\]]+/i);
      const sourceUrl = d.source_url
        || (/^https?:\/\//i.test(inputText) ? inputText : null)
        || (urlMatch ? urlMatch[0] : null);
      // Harvest any inline image URLs from the raw paste that the AI may have dropped.
      const inlineImages = Array.from(
        inputText.matchAll(/https?:\/\/[^\s"'<>)\]]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>)\]]*)?/gi)
      ).map((m) => m[0]);
      const yad2Images = Array.from(
        inputText.matchAll(/https?:\/\/img\.yad2\.co\.il\/[^\s"'<>)\]]+/gi)
      ).map((m) => m[0]);
      const mergedPhotos = Array.from(new Set([
        ...(Array.isArray(d.photos) ? d.photos : []),
        ...inlineImages,
        ...yad2Images,
      ])).filter((u) => /^https?:\/\//.test(u));
      setParsed({ ...d, source_url: sourceUrl, photos: mergedPhotos });
      toast.success(`הפרטים חולצו בהצלחה${mergedPhotos.length ? ` (${mergedPhotos.length} תמונות)` : ''} — סקרו ושמרו`);
    } catch (e: any) {
      toast.error(`שגיאה בחילוץ: ${e.message ?? e}`);
    } finally {
      setHydrating(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialText && autoFiredRef.current !== initialText) {
      setAiText(initialText);
      if (autoHydrate) {
        autoFiredRef.current = initialText;
        handleHydrate(initialText);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText, autoHydrate]);

  const handleSubmit = async () => {
    if (!parsed) {
      toast.error('הדבק תוכן ולחץ "נתח והשלם פרטים"');
      return;
    }
    if (!parsed.city || !parsed.price) {
      toast.error('חסר עיר או מחיר במודעה');
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        toast.error('יש להתחבר כדי להוסיף נכס');
        return;
      }
      const propType = (parsed.property_type as PropertyType) || 'apartment';
      const title = `${PROPERTY_TYPE_LABELS_HE[propType] || 'נכס'} ב${parsed.city}${parsed.rooms ? ` · ${parsed.rooms} חד'` : ''}`;
      const sourceUrl = parsed.source_url || '';
      const source =
        (defaultSource && defaultSource !== 'manual') ? defaultSource :
        sourceUrl.includes('yad2') ? 'yad2' :
        sourceUrl.includes('madlan') ? 'madlan' :
        (defaultSource || 'manual');
      const features2 = {
        parking: typeof parsed.parking === 'number' ? parsed.parking : undefined,
        ac: !!parsed.air_conditioning,
        solar: !!parsed.solar_heater,
        shelter: !!parsed.shelter,
        elevator: !!parsed.elevator,
      };
      const { error } = await supabase.from('listings').insert({
        user_id: auth.user.id,
        slug: slugify(title),
        property_title: title,
        description: (parsed.description || title).trim(),
        asking_price: Number(parsed.price) || 0,
        city: parsed.city.trim(),
        neighborhood: parsed.neighborhood?.trim() || null,
        rooms: parsed.rooms ?? null,
        sqm: parsed.sqm ?? null,
        floor: parsed.floor ?? null,
        status: 'live',
        source,
        source_url: sourceUrl || null,
        source_metadata: { photos: parsed.photos, total_floors: parsed.total_floors ?? null, year_built: parsed.year_built ?? null, ...features2 },
        parking: features2.parking != null ? features2.parking > 0 : null,
        elevator: features2.elevator ?? null,
        is_published: true,
        features: [{ listing_type: parsed.listing_type, property_type: propType, ...features2 }],
      });
      if (error) throw error;
      toast.success('הנכס נוסף בהצלחה');
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      toast.error(`שגיאה בהוספת הנכס: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Build a HomelyProperty preview object from parsed data
  const previewProperty: HomelyProperty | null = parsed ? {
    id: 'preview',
    source: 'mine',
    title: '',
    description: parsed.description || '',
    price: Number(parsed.price) || 0,
    currency: '₪',
    city: parsed.city || '',
    address: parsed.neighborhood || '',
    rooms: Number(parsed.rooms) || 0,
    size_sqm: Number(parsed.sqm) || 0,
    property_type: (parsed.property_type as PropertyType) || 'apartment',
    photos: parsed.photos || [],
    url: parsed.source_url || null,
    features: [],
    listing_type: parsed.listing_type,
    floor: parsed.floor ?? undefined,
  } : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent
        dir="rtl"
        className="w-screen h-screen max-w-none sm:max-w-none p-0 gap-0 rounded-none border-0 flex flex-col"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>הוספת נכס</DialogTitle>
          <DialogDescription>הוספת נכס לקטלוג</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {/* State 1: Initial — show paste box. Hidden the moment hydrate fires. */}
          {!hydrating && !parsed && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2 max-w-2xl mx-auto mt-6">
              <Label className="text-xs font-bold flex items-center gap-1.5 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                הדבק כאן טקסט מודעה (Yad2 / מדלן) או קישור
              </Label>
              <Textarea
                dir="rtl"
                rows={6}
                placeholder="הדבק את גוף המודעה — AI יחלץ אוטומטית את כל הפרטים והתמונות..."
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                className="resize-none text-sm bg-background"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => handleHydrate()}
                disabled={aiText.trim().length < 10}
                className="w-full gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                נתח והשלם פרטים
              </Button>
            </div>
          )}

          {/* State 2: Loading — centered spinner only */}
          {hydrating && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">מנתח את המודעה...</p>
            </div>
          )}

          {/* State 3: Parsed — pure PropertyDetailView */}
          {!hydrating && previewProperty && parsed && (
            <PropertyDetailView
              property={previewProperty}
              meta={{}}
              amenities={{
                parking: parsed.parking ?? 0,
                elevator: !!parsed.elevator,
                ac: !!parsed.air_conditioning,
                shelter: !!parsed.shelter,
                solar: !!parsed.solar_heater,
              }}
              neighborhood={parsed.neighborhood}
              sourceUrl={parsed.source_url}
            />
          )}
        </div>


        <DialogFooter className="px-6 py-4 border-t shrink-0 flex-row justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !parsed}>
            {submitting ? 'שומר...' : 'הוסף נכס'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
