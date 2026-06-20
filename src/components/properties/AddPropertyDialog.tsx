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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PROPERTY_TYPE_LABELS_HE, type PropertyType } from '@/lib/homelyMockProperties';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  initialText?: string;
  autoHydrate?: boolean;
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

export function AddPropertyDialog({ open, onOpenChange, onCreated, initialText, autoHydrate }: Props) {
  const [listingType, setListingType] = useState<'sale' | 'rent'>('sale');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
  const [rooms, setRooms] = useState('');
  const [sqm, setSqm] = useState('');
  const [floor, setFloor] = useState('');
  const [description, setDescription] = useState('');
  const [aiText, setAiText] = useState('');
  const [hydrating, setHydrating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [features2, setFeatures2] = useState<{ parking?: number; ac?: boolean; solar?: boolean; shelter?: boolean; elevator?: boolean }>({});
  const autoFiredRef = useRef<string | null>(null);

  const reset = () => {
    setListingType('sale');
    setPrice('');
    setCity('');
    setNeighborhood('');
    setPropertyType('apartment');
    setRooms('');
    setSqm('');
    setFloor('');
    setDescription('');
    setAiText('');
    setPhotos([]);
    setSourceUrl('');
    setFeatures2({});
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
      if (!data?.ok || !data?.data) throw new Error(data?.error || 'parse_failed');
      const d = data.data;
      if (d.listing_type) setListingType(d.listing_type);
      if (d.property_type) setPropertyType(d.property_type);
      if (d.city) setCity(d.city);
      if (d.neighborhood) setNeighborhood(d.neighborhood);
      if (d.rooms != null) setRooms(String(d.rooms));
      if (d.price != null) setPrice(String(d.price));
      if (d.sqm != null) setSqm(String(d.sqm));
      if (d.floor != null) setFloor(String(d.floor));
      if (d.description) setDescription(d.description);
      if (Array.isArray(d.photos)) setPhotos(d.photos.filter((p: any) => typeof p === 'string').slice(0, 20));
      if (typeof d.source_url === 'string') setSourceUrl(d.source_url);
      else if (/^https?:\/\//i.test(inputText)) setSourceUrl(inputText);
      setFeatures2({
        parking: typeof d.parking === 'number' ? d.parking : undefined,
        ac: !!d.air_conditioning,
        solar: !!d.solar_heater,
        shelter: !!d.shelter,
        elevator: !!d.elevator,
      });
      toast.success(`הפרטים חולצו בהצלחה${Array.isArray(d.photos) && d.photos.length ? ` (${d.photos.length} תמונות)` : ''} — סקרו ושמרו`);
    } catch (e: any) {
      toast.error(`שגיאה בחילוץ: ${e.message ?? e}`);
    } finally {
      setHydrating(false);
    }
  };

  // Seed from initialText and optionally auto-fire hydration
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
    if (!city.trim() || !price) {
      toast.error('יש למלא לפחות עיר ומחיר');
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        toast.error('יש להתחבר כדי להוסיף נכס');
        return;
      }
      const title = `${PROPERTY_TYPE_LABELS_HE[propertyType]} ב${city}${rooms ? ` · ${rooms} חד'` : ''}`;
      const { error } = await supabase.from('listings').insert({
        user_id: auth.user.id,
        slug: slugify(title),
        property_title: title,
        description: description.trim() || title,
        asking_price: Number(price) || 0,
        city: city.trim(),
        neighborhood: neighborhood.trim() || null,
        rooms: rooms ? Number(rooms) : null,
        sqm: sqm ? Number(sqm) : null,
        floor: floor ? Number(floor) : null,
        status: 'live',
        source: 'manual',
        is_published: true,
        features: [{ listing_type: listingType, property_type: propertyType }],
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הוספת נכס ידנית</DialogTitle>
          <DialogDescription>הזינו פרטי נכס בסיסיים, או הדביקו טקסט מודעה וה-AI ימלא את השדות.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* AI Paste & Hydrate */}
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
            <Label className="text-xs font-bold flex items-center gap-1.5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              הדבקת טקסט חופשי או מודעה (Yad2 / מדלן)
            </Label>
            <Textarea
              dir="rtl"
              rows={4}
              placeholder="הדבק כאן את הטקסט המועתק מהמודעה הציבורית, וה-AI יחלץ את כל השדות אוטומטית..."
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              className="resize-none text-sm bg-background"
              disabled={hydrating}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleHydrate}
              disabled={hydrating || aiText.trim().length < 10}
              className="w-full gap-1.5"
            >
              {hydrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {hydrating ? 'מנתח...' : 'נתח והשלם פרטים'}
            </Button>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-xl border border-primary/20 bg-card/40 p-1" dir="rtl">
              {(['sale', 'rent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setListingType(t)}
                  className={`px-5 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                    listingType === t
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'sale' ? 'למכירה' : 'להשכרה'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">מחיר</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                  ₪
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="₪1,500,000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">עיר</Label>
              <Input
                placeholder="לדוגמה: תל אביב"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">שכונה</Label>
              <Input
                placeholder="לדוגמה: פלורנטין"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">סוג נכס</Label>
              <Select value={propertyType} onValueChange={(v) => setPropertyType(v as PropertyType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROPERTY_TYPE_LABELS_HE)
                    .filter(([k]) => k !== 'all')
                    .map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">חדרים</Label>
              <Input
                type="number"
                step="0.5"
                placeholder="4"
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">שטח (מ"ר)</Label>
              <Input
                type="number"
                placeholder="100"
                value={sqm}
                onChange={(e) => setSqm(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">קומה</Label>
              <Input
                type="number"
                placeholder="3"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">תיאור / הערות</Label>
              <Textarea
                dir="rtl"
                rows={3}
                placeholder="חניה, מעלית, מרפסת, שיפוץ..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none text-sm"
              />
            </div>
          </div>
        </div>


        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'שומר...' : 'הוסף נכס'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
