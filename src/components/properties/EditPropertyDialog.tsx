import { useEffect, useRef, useState } from 'react';
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
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import {
  PROPERTY_TYPE_LABELS_HE,
  type PropertyType,
  type HomelyProperty,
  type ListingType,
} from '@/lib/homelyMockProperties';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'חדש מקבלן' },
  { value: 'renovated', label: 'משופץ' },
  { value: 'good', label: 'שמור' },
  { value: 'needs_renovation', label: 'דורש שיפוץ' },
];

interface Props {
  property: HomelyProperty | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

export function EditPropertyDialog({ property, open, onOpenChange, onSaved }: Props) {
  const [listingType, setListingType] = useState<ListingType>('sale');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
  const [rooms, setRooms] = useState('');
  const [sqm, setSqm] = useState('');
  const [floor, setFloor] = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [balconySqm, setBalconySqm] = useState('');
  const [condition, setCondition] = useState<string>('');
  const [directions, setDirections] = useState('');
  const [parking, setParking] = useState(false);
  const [elevator, setElevator] = useState(false);
  const [balcony, setBalcony] = useState(false);
  const [safeRoom, setSafeRoom] = useState(false);
  const [storage, setStorage] = useState(false);
  const [airConditioning, setAirConditioning] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [renovated, setRenovated] = useState(false);
  const [furnished, setFurnished] = useState(false);
  const [bars, setBars] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const hydrateFromRow = (p: any) => {
    const meta = p.source_metadata ?? {};
    const featObj = Array.isArray(p.features) ? (p.features[0] ?? {}) : (p.features ?? {});
    const extras = (featObj && typeof featObj === 'object' ? featObj.extras : null) ?? {};
    setListingType((p.listing_type ?? featObj?.listing_type) === 'rent' ? 'rent' : 'sale');
    setTitle(p.title ?? p.property_title ?? '');
    setDescription(p.description ?? '');
    setPrice((p.price ?? p.asking_price) ? String(p.price ?? p.asking_price) : '');
    setCity(p.city ?? '');
    setAddress(p.address ?? '');
    setPropertyType((p.property_type ?? featObj?.property_type) ?? 'apartment');
    setRooms((p.rooms ?? null) != null ? String(p.rooms) : '');
    setSqm((p.size_sqm ?? p.sqm) != null ? String(p.size_sqm ?? p.sqm) : '');
    setFloor(p.floor != null ? String(p.floor) : '');
    setTotalFloors(p.total_floors != null ? String(p.total_floors) : (extras.total_floors != null ? String(extras.total_floors) : ''));
    const yb = p.year_built ?? featObj?.year_built;
    setYearBuilt(yb != null ? String(yb) : '');
    setNeighborhood(p.neighborhood ?? '');
    setBalconySqm(extras.balcony_sqm != null ? String(extras.balcony_sqm) : '');
    setCondition(extras.condition ?? '');
    setDirections(extras.directions ?? '');
    setParking(Boolean(p.parking ?? extras.parking));
    setElevator(Boolean(p.elevator ?? extras.elevator));
    setBalcony(Boolean(extras.balcony));
    setSafeRoom(Boolean(extras.safe_room));
    setStorage(Boolean(extras.storage));
    setAirConditioning(Boolean(extras.air_conditioning));
    setAccessible(Boolean(extras.accessible));
    setRenovated(Boolean(extras.renovated));
    setFurnished(Boolean(extras.furnished));
    setBars(Boolean(extras.bars));
    const existingPhotos = p.photos ?? meta.photos;
    setPhotos(Array.isArray(existingPhotos) ? existingPhotos.filter((x: any) => typeof x === 'string') : []);
  };

  useEffect(() => {
    if (!property || !open) return;
    hydrateFromRow(property);
    // Fetch fresh full row from DB so extras / parking / elevator / features
    // round-trip correctly even when the list view stripped them.
    (async () => {
      const { data } = await supabase
        .from('listings')
        .select('property_title, description, asking_price, city, address, neighborhood, rooms, sqm, floor, parking, elevator, features, source_metadata')
        .eq('id', property.id)
        .maybeSingle();
      if (data) hydrateFromRow({ ...property, ...data });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, open]);

  const handleSyncFromHomely = async () => {
    if (!property) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('homely-fetch-property', {
        body: { listing_id: property.id },
      });
      if (error) throw error;
      const payload = (data as any) ?? {};
      // Graceful zero-state: edge fn returns { fallback: true } with HTTP 200
      // when the broker has no active properties / serial isn't on Homely.
      if (payload.fallback) {
        if (payload.error === "property_not_found_in_broker_list" || payload.broker_active_count === 0) {
          toast.message("אין נכסים פעילים בחשבון הומלי המחובר", {
            description: "ודא שהנכס פעיל ב-Homely ולחץ שוב על סנכרון.",
          });
        } else {
          toast.message("הנכס לא נמצא ב-Homely", { description: "נסה לסנכרן שוב מאוחר יותר." });
        }
        return;
      }
      if (payload.error) throw new Error(payload.error);
      const u = payload.updated ?? {};
      if (u.property_title) setTitle(u.property_title);
      if (u.description) setDescription(u.description);
      if (u.asking_price) setPrice(String(u.asking_price));
      if (u.city) setCity(u.city);
      if (u.address) setAddress(u.address);
      if (u.rooms) setRooms(String(u.rooms));
      if (u.sqm) setSqm(String(u.sqm));
      if (u.floor != null) setFloor(String(u.floor));
      const newPhotos = u?.source_metadata?.photos;
      if (Array.isArray(newPhotos)) setPhotos(newPhotos);
      toast.success(`נטענו ${payload.photo_count ?? 0} תמונות מ-Homely`);
      onSaved?.();
    } catch (e: any) {
      toast.error(`סנכרון נכשל: ${e.message ?? e}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async () => {
    if (!property) return;
    if (!city.trim() || !price) {
      toast.error('יש למלא לפחות עיר ומחיר');
      return;
    }
    setSubmitting(true);
    try {
      const numericPrice = Number(price) || 0;
      const extras = {
        balcony,
        balcony_sqm: balconySqm ? Number(balconySqm) : null,
        safe_room: safeRoom,
        storage,
        air_conditioning: airConditioning,
        accessible,
        renovated,
        furnished,
        bars,
        parking,
        elevator,
        condition: condition || null,
        directions: directions.trim() || null,
        total_floors: totalFloors ? Number(totalFloors) : null,
      };
      const { error } = await supabase
        .from('listings')
        .update({
          property_title: title.trim() || `${PROPERTY_TYPE_LABELS_HE[propertyType]} ב${city}`,
          description: description.trim() || title.trim(),
          asking_price: numericPrice,
          city: city.trim(),
          neighborhood: neighborhood.trim() || null,
          address: address.trim() || null,
          rooms: rooms ? Number(rooms) : null,
          sqm: sqm ? Number(sqm) : null,
          floor: floor ? Number(floor) : null,
          parking,
          elevator,
          features: [{
            listing_type: listingType,
            property_type: propertyType,
            year_built: yearBuilt ? Number(yearBuilt) : null,
            extras,
          }],
        })
        .eq('id', property.id);
      if (error) throw error;
      toast.success('הנכס עודכן');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(`שגיאה בעדכון: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת נכס</DialogTitle>
          <DialogDescription>עדכן את פרטי הנכס. השינויים יישמרו מיידית.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/15 bg-primary/5 p-2.5">
            <div className="text-xs text-muted-foreground">
              משוך את כל הנתונים והתמונות העדכניות מ-Homely
            </div>
            <Button type="button" size="sm" variant="outline" onClick={handleSyncFromHomely} disabled={syncing} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'מסנכרן…' : 'סנכרן מ-Homely'}
            </Button>
          </div>

          {photos.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">תמונות ({photos.length})</Label>
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {photos.map((url, i) => (
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    alt={`photo-${i}`}
                    className="aspect-square object-cover rounded-md border"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">כותרת</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: דירת 4 חדרים בלב תל אביב" />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">תיאור</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="תאר את הנכס, יתרונותיו וסביבתו"
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">מחיר</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">₪</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="1,500,000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">עיר</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">כתובת</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="רחוב ומספר" />
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
              <Input type="number" step="0.5" value={rooms} onChange={(e) => setRooms(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">שטח (מ"ר)</Label>
              <Input type="number" value={sqm} onChange={(e) => setSqm(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">קומה</Label>
              <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">קומות בבניין</Label>
              <Input type="number" value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">שנת בנייה</Label>
              <Input type="number" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">שכונה</Label>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">שטח מרפסת (מ"ר)</Label>
              <Input type="number" value={balconySqm} onChange={(e) => setBalconySqm(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">מצב הנכס</Label>
              <Select value={condition || undefined} onValueChange={(v) => setCondition(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">כיווני אוויר</Label>
              <Input value={directions} onChange={(e) => setDirections(e.target.value)} placeholder="צפון, מזרח..." />
            </div>

            <div className="col-span-2 space-y-2 pt-2 border-t">
              <Label className="text-xs font-semibold">מאפיינים נוספים</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {([
                  ['מרפסת', balcony, setBalcony],
                  ['ממ"ד', safeRoom, setSafeRoom],
                  ['חניה', parking, setParking],
                  ['מעלית', elevator, setElevator],
                  ['מחסן', storage, setStorage],
                  ['מיזוג אוויר', airConditioning, setAirConditioning],
                  ['גישה לנכים', accessible, setAccessible],
                  ['משופץ', renovated, setRenovated],
                  ['מרוהט', furnished, setFurnished],
                  ['סורגים', bars, setBars],
                ] as const).map(([label, val, setter]) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox checked={val} onCheckedChange={(v) => (setter as any)(Boolean(v))} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'שומר...' : 'שמור שינויים'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
