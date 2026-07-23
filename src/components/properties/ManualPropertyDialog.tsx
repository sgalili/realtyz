/**
 * ManualPropertyDialog
 * --------------------
 * Blank property form (mirrors EditPropertyDialog layout) with a Sale/Rent
 * toggle. Opened from the "+ הוספת נכס ידנית" menu item. Does NOT run any
 * AI-hydration — every field is a plain manual input.
 */
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
import { Upload, X, Loader2 } from 'lucide-react';
import {
  PROPERTY_TYPE_LABELS_HE,
  type PropertyType,
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
import { uploadMediaToLibrary } from '@/lib/mediaUpload';

const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'חדש מקבלן' },
  { value: 'renovated', label: 'משופץ' },
  { value: 'good', label: 'שמור' },
  { value: 'needs_renovation', label: 'דורש שיפוץ' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
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

export function ManualPropertyDialog({ open, onOpenChange, onCreated }: Props) {
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
  const [videos, setVideos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // Reset the form every time the dialog re-opens.
  useEffect(() => {
    if (!open) return;
    setListingType('sale');
    setTitle(''); setDescription(''); setPrice(''); setCity(''); setAddress('');
    setPropertyType('apartment'); setRooms(''); setSqm(''); setFloor(''); setTotalFloors('');
    setYearBuilt(''); setNeighborhood(''); setBalconySqm(''); setCondition(''); setDirections('');
    setParking(false); setElevator(false); setBalcony(false); setSafeRoom(false); setStorage(false);
    setAirConditioning(false); setAccessible(false); setRenovated(false); setFurnished(false); setBars(false);
    setPhotos([]); setVideos([]);
  }, [open]);

  const handleUpload = async (files: FileList | null, kind: 'photo' | 'video') => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { toast.error('יש להתחבר'); return; }
      const uploaded: string[] = [];
      for (const f of Array.from(files)) {
        const row = await uploadMediaToLibrary({
          userId: auth.user.id,
          fileName: f.name,
          data: f,
          mimeType: f.type,
          source: 'manual_property_upload',
        });
        if (row?.public_url) uploaded.push(row.public_url);
      }
      if (kind === 'photo') setPhotos((prev) => [...prev, ...uploaded]);
      else setVideos((prev) => [...prev, ...uploaded]);
      toast.success(`הועלו ${uploaded.length} קבצים`);
    } catch (e: any) {
      toast.error(`שגיאת העלאה: ${e.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!city.trim() || !price) {
      toast.error('יש למלא לפחות עיר ומחיר');
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { toast.error('יש להתחבר'); return; }
      const numericPrice = Number(price) || 0;
      const finalTitle = title.trim() || `${PROPERTY_TYPE_LABELS_HE[propertyType]} ב${city}`;
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
      const { error } = await supabase.from('listings').insert({
        user_id: auth.user.id,
        slug: slugify(finalTitle),
        property_title: finalTitle,
        description: description.trim() || finalTitle,
        asking_price: numericPrice,
        deal_type: listingType,
        city: city.trim(),
        neighborhood: neighborhood.trim() || null,
        address: address.trim() || null,
        rooms: rooms ? Number(rooms) : null,
        sqm: sqm ? Number(sqm) : null,
        floor: floor ? Number(floor) : null,
        parking,
        elevator,
        status: 'live',
        source: 'manual',
        is_published: true,
        media_photos: photos,
        source_metadata: {
          photos,
          videos,
          total_floors: extras.total_floors,
          year_built: yearBuilt ? Number(yearBuilt) : null,
        },
        features: [{
          listing_type: listingType,
          property_type: propertyType,
          year_built: yearBuilt ? Number(yearBuilt) : null,
          extras,
        }],
      });
      if (error) throw error;
      toast.success('הנכס נוסף');
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      toast.error(`שגיאה בהוספה: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הוספת נכס ידנית</DialogTitle>
          <DialogDescription>מלא את פרטי הנכס. כל השדות ניתנים לעריכה חופשית.</DialogDescription>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">תמונות ({photos.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} disabled={uploading} className="gap-1.5">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                העלה תמונות
              </Button>
              <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleUpload(e.target.files, 'photo')} />
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {photos.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative group">
                    <img src={url} alt={`photo-${i}`} className="aspect-square object-cover rounded-md border w-full" loading="lazy" />
                    <button type="button" onClick={() => setPhotos((prev) => prev.filter((u) => u !== url))} className="absolute top-1 left-1 h-5 w-5 rounded-full bg-destructive/90 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" aria-label="הסר תמונה">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">סרטונים ({videos.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => videoInputRef.current?.click()} disabled={uploading} className="gap-1.5">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                העלה סרטון
              </Button>
              <input ref={videoInputRef} type="file" accept="video/*" multiple hidden onChange={(e) => handleUpload(e.target.files, 'video')} />
            </div>
            {videos.length > 0 && (
              <div className="space-y-2">
                {videos.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative">
                    <video src={url} controls className="w-full rounded-md border max-h-48 bg-black" />
                    <button type="button" onClick={() => setVideos((prev) => prev.filter((u) => u !== url))} className="absolute top-1 left-1 h-6 w-6 rounded-full bg-destructive/90 text-white flex items-center justify-center" aria-label="הסר סרטון">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">כותרת</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: דירת 4 חדרים בלב תל אביב" />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">תיאור</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="תאר את הנכס, יתרונותיו וסביבתו" />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">מחיר</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">₪</span>
                <Input type="number" inputMode="numeric" placeholder={listingType === 'rent' ? '7,500' : '1,500,000'} value={price} onChange={(e) => setPrice(e.target.value)} className="pl-7" />
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROPERTY_TYPE_LABELS_HE)
                    .filter(([k]) => k !== 'all')
                    .map(([k, label]) => (<SelectItem key={k} value={k}>{label}</SelectItem>))}
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
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
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
          <Button onClick={handleSubmit} disabled={submitting || uploading}>
            {submitting ? 'שומר...' : 'הוסף נכס'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
