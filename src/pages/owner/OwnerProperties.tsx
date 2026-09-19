import { useState } from 'react';
import { Home, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ownerListingPhotos, useOwnerListings, useUpdateOwnerListing, type OwnerListing } from '@/hooks/useOwnerListings';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';

/** Private owner screen: their own properties, with details and image editing. */
export default function OwnerProperties() {
  const { data: listings = [], isLoading } = useOwnerListings();
  const update = useUpdateOwnerListing();
  const [editing, setEditing] = useState<OwnerListing | null>(null);
  const [form, setForm] = useState({ title: '', description: '', price: '', rooms: '', sqm: '', address: '', photos: '' });

  const openEdit = (listing: OwnerListing) => {
    setEditing(listing);
    setForm({
      title: listing.property_title ?? '',
      description: listing.description ?? '',
      price: listing.asking_price != null ? String(listing.asking_price) : '',
      rooms: listing.rooms != null ? String(listing.rooms) : '',
      sqm: listing.sqm != null ? String(listing.sqm) : '',
      address: listing.address ?? '',
      photos: ownerListingPhotos(listing).join('\n'),
    });
  };

  const save = async () => {
    if (!editing) return;
    const photos = form.photos.split('\n').map((p) => p.trim()).filter((p) => /^https?:\/\//i.test(p));
    try {
      await update.mutateAsync({
        id: editing.id,
        patch: {
          property_title: form.title.trim() || null,
          description: form.description.trim() || null,
          asking_price: form.price ? Number(form.price) : null,
          rooms: form.rooms ? Number(form.rooms) : null,
          sqm: form.sqm ? Number(form.sqm) : null,
          address: form.address.trim() || null,
          media_photos: photos,
          image_url: photos[0] ?? null,
        },
      });
      toast.success('הנכס עודכן');
      setEditing(null);
    } catch {
      toast.error('העדכון נכשל');
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Home className="h-5 w-5 text-amber-600" /> הנכסים שלי
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">צפייה ועריכה של פרטי הנכסים והתמונות שלכם.</p>
        </div>
        <PublicListingPublisher autoResume disabled={listings.length >= 1} />
      </header>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">טוען…</p>
      ) : listings.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">אין נכסים רשומים על שמכם</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const photos = ownerListingPhotos(listing);
            return (
              <article key={listing.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {photos[0] ? (
                  <img src={photos[0]} alt={listing.property_title ?? 'נכס'} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-muted text-xs text-muted-foreground">אין תמונות</div>
                )}
                <div className="space-y-1 p-3">
                  <h2 className="text-sm font-bold text-foreground">{listing.property_title || 'נכס ללא כותרת'}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[listing.city, listing.neighborhood, listing.address].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {listing.asking_price ? `₪${Number(listing.asking_price).toLocaleString('he-IL')}` : 'מחיר לא צוין'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[listing.rooms ? `${listing.rooms} חדרים` : null, listing.sqm ? `${listing.sqm} מ״ר` : null, `${photos.length} תמונות`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => openEdit(listing)}>
                    <Pencil className="me-1 h-4 w-4" /> עריכה
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle className="text-right text-base">עריכת נכס</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input placeholder="כותרת" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder="כתובת" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="מחיר" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <Input placeholder="חדרים" inputMode="decimal" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
              <Input placeholder="מ״ר" inputMode="numeric" value={form.sqm} onChange={(e) => setForm({ ...form, sqm: e.target.value })} />
            </div>
            <Textarea rows={4} placeholder="תיאור" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Textarea rows={4} placeholder="כתובות תמונות, אחת בכל שורה" value={form.photos} onChange={(e) => setForm({ ...form, photos: e.target.value })} />
            <Button className="w-full" disabled={update.isPending} onClick={() => void save()}>
              {update.isPending ? 'שומר…' : 'שמירה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
