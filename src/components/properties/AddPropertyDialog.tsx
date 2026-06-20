import { useState } from 'react';
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

export function AddPropertyDialog({ open, onOpenChange, onCreated }: Props) {
  const [listingType, setListingType] = useState<'sale' | 'rent'>('sale');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
  const [rooms, setRooms] = useState('');
  const [sqm, setSqm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setListingType('sale');
    setPrice('');
    setCity('');
    setPropertyType('apartment');
    setRooms('');
    setSqm('');
  };

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
        description: title,
        asking_price: Number(price) || 0,
        city: city.trim(),
        rooms: rooms ? Number(rooms) : null,
        sqm: sqm ? Number(sqm) : null,
        status: 'live',
        source: 'manual',
        is_published: true,
        features: [{ listing_type: listingType }],
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
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>הוספת נכס ידנית</DialogTitle>
          <DialogDescription>הזינו פרטי נכס בסיסיים. ניתן להעשיר מאוחר יותר.</DialogDescription>
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

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">עיר / אזור</Label>
              <Input
                placeholder="לדוגמה: תל אביב"
                value={city}
                onChange={(e) => setCity(e.target.value)}
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

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">שטח (מ"ר)</Label>
              <Input
                type="number"
                placeholder="100"
                value={sqm}
                onChange={(e) => setSqm(e.target.value)}
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
