import { useEffect, useState } from 'react';
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
  const [yearBuilt, setYearBuilt] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!property) return;
    setListingType(property.listing_type === 'rent' ? 'rent' : 'sale');
    setTitle(property.title ?? '');
    setDescription(property.description ?? '');
    setPrice(property.price ? String(property.price) : '');
    setCity(property.city ?? '');
    setAddress(property.address ?? '');
    setPropertyType(property.property_type ?? 'apartment');
    setRooms(property.rooms ? String(property.rooms) : '');
    setSqm(property.size_sqm ? String(property.size_sqm) : '');
    setFloor(property.floor != null ? String(property.floor) : '');
    setYearBuilt(property.year_built != null ? String(property.year_built) : '');
  }, [property]);

  const handleSubmit = async () => {
    if (!property) return;
    if (!city.trim() || !price) {
      toast.error('יש למלא לפחות עיר ומחיר');
      return;
    }
    setSubmitting(true);
    try {
      const numericPrice = Number(price) || 0;
      const { error } = await supabase
        .from('listings')
        .update({
          property_title: title.trim() || `${PROPERTY_TYPE_LABELS_HE[propertyType]} ב${city}`,
          description: description.trim() || title.trim(),
          asking_price: numericPrice,
          city: city.trim(),
          address: address.trim() || null,
          rooms: rooms ? Number(rooms) : null,
          sqm: sqm ? Number(sqm) : null,
          floor: floor ? Number(floor) : null,
          features: [{ listing_type: listingType, property_type: propertyType, year_built: yearBuilt ? Number(yearBuilt) : null }],
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
              <Label className="text-xs font-semibold">שנת בנייה</Label>
              <Input type="number" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
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
