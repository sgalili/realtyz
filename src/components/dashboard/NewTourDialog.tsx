/**
 * NewTourDialog
 * -------------
 * End-to-end flow for scheduling a new property tour:
 * pick an existing contact (or type a new one) -> pick a property -> date & time
 * -> optional WhatsApp confirmation sent from the OFFICIAL Meta WBA number only
 * (see src/lib/officialWa.ts).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search } from 'lucide-react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { sendViaOfficialWaba } from '@/lib/officialWa';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

type LeadOption = {
  id: string;
  full_name: string | null;
  phone_number: string;
  email: string | null;
  profile_picture_url: string | null;
};

type ListingOption = {
  id: string;
  property_title: string;
  address: string | null;
  city: string | null;
  image_url: string | null;
  media_photos: unknown;
  rooms: number | null;
  sqm: number | null;
  asking_price: number | null;
  deal_type: string | null;
};

function listingPhoto(listing: ListingOption) {
  if (listing.image_url) return listing.image_url;
  if (!Array.isArray(listing.media_photos)) return null;
  const photo = listing.media_photos.find((item) => typeof item === 'string' || (item && typeof item === 'object'));
  if (typeof photo === 'string') return photo;
  if (photo && typeof photo === 'object') {
    const candidate = photo as { url?: unknown; src?: unknown };
    return typeof candidate.url === 'string' ? candidate.url : typeof candidate.src === 'string' ? candidate.src : null;
  }
  return null;
}

function formatPrice(value: number | null) {
  return typeof value === 'number' ? `${new Intl.NumberFormat('he-IL').format(value)} ₪` : 'מחיר לא צוין';
}

function defaultDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NewTourDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const ownerId = useActiveWorkspaceOwnerId();

  const [contactQuery, setContactQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [listingQuery, setListingQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<ListingOption | null>(null);
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [sendWa, setSendWa] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: leads = [] } = useQuery({
    queryKey: ['new-tour-leads', ownerId, contactQuery],
    enabled: !!ownerId && open && contactQuery.trim().length >= 2,
    queryFn: async () => {
      const q = contactQuery.trim();
      const { data } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, email, profile_picture_url')
        .eq('workspace_owner_id', ownerId!)
        .or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`)
        .limit(8);
      return (data ?? []) as LeadOption[];
    },
  });

  const { data: listings = [] } = useQuery({
    queryKey: ['new-tour-listings', ownerId, listingQuery],
    enabled: !!ownerId && open,
    queryFn: async () => {
      let query = supabase
        .from('listings')
        .select('id, property_title, address, city, image_url, media_photos, rooms, sqm, asking_price, deal_type')
        .eq('workspace_owner_id', ownerId!)
        .order('created_at', { ascending: false })
        .limit(8);
      const q = listingQuery.trim();
      if (q.length >= 2) query = query.or(`property_title.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%`);
      const { data } = await query;
      return (data ?? []) as ListingOption[];
    },
  });

  const propertyLabel = useMemo(() => {
    if (!selectedListing) return '';
    return [selectedListing.property_title, selectedListing.address, selectedListing.city].filter(Boolean).join(', ');
  }, [selectedListing]);

  const pickLead = (l: LeadOption) => {
    setSelectedLead(l);
    setName(l.full_name ?? '');
    setPhone(l.phone_number ?? '');
    setEmail(l.email ?? '');
    setContactQuery('');
  };

  const reset = () => {
    setContactQuery('');
    setSelectedLead(null);
    setName('');
    setPhone('');
    setEmail('');
    setListingQuery('');
    setSelectedListing(null);
    setDate(defaultDate());
    setTime('17:00');
    setNotes('');
    setSendWa(true);
  };

  const submit = async () => {
    if (!ownerId) return;
    if (!name.trim() || !phone.trim()) {
      toast.error('נדרשים שם וטלפון של איש הקשר');
      return;
    }
    if (!date || !time) {
      toast.error('נדרשים תאריך ושעה לסיור');
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00+03:00`);
      const { error } = await supabase.from('property_tours').insert({
        owner_id: ownerId,
        client_name: name.trim(),
        client_phone: phone.trim(),
        client_email: email.trim() || null,
        listing_id: selectedListing?.id ?? null,
        property_title: selectedListing?.property_title ?? null,
        property_address: [selectedListing?.address, selectedListing?.city].filter(Boolean).join(', ') || null,
        scheduled_at: scheduledAt.toISOString(),
        notes: notes.trim() || null,
        status: 'confirmed',
        timezone: 'Asia/Jerusalem',
      });
      if (error) throw error;

      if (sendWa) {
        const when = scheduledAt.toLocaleString('he-IL', {
          timeZone: 'Asia/Jerusalem',
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const where = propertyLabel || 'הנכס';
        const res = await sendViaOfficialWaba({
          phone_number: phone.trim(),
          message: `שלום ${name.trim()}, קבענו סיור ב${where} ב${when}. נתראה!`,
        });
        if (!res.ok) toast.error(res.error || 'הסיור נשמר, אך שליחת האישור בוואטסאפ נכשלה');
      }

      toast.success('הסיור נקבע');
      qc.invalidateQueries({ queryKey: ['scheduled-tours'] });
      qc.invalidateQueries({ queryKey: ['command-center-tasks'] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'קביעת הסיור נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>סיור חדש</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>איש קשר</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pr-9"
                placeholder="חיפוש לפי שם או טלפון"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
              />
            </div>
            {leads.length > 0 && contactQuery.trim().length >= 2 ? (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1">
                {leads.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => pickLead(l)}
                    className="flex w-full items-center gap-2 rounded-md p-2 text-right hover:bg-accent"
                  >
                    <ContactAvatar name={l.full_name ?? ''} imageUrl={l.profile_picture_url} className="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.full_name || 'ללא שם'}</span>
                      <span className="block text-[12px] text-muted-foreground">{formatPhoneDisplay(l.phone_number)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="שם מלא" value={name} onChange={(e) => { setSelectedLead(null); setName(e.target.value); }} />
              <Input placeholder="טלפון" value={phone} onChange={(e) => { setSelectedLead(null); setPhone(e.target.value); }} />
            </div>
            <Input placeholder="אימייל (לא חובה)" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>נכס</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-9"
                placeholder="חיפוש נכס"
                value={listingQuery}
                onChange={(e) => setListingQuery(e.target.value)}
              />
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
              {listings.length === 0 ? (
                <p className="p-2 text-[12px] text-muted-foreground">לא נמצאו נכסים</p>
              ) : (
                listings.map((p) => {
                  const active = selectedListing?.id === p.id;
                  const photo = listingPhoto(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedListing(active ? null : p)}
                      className={`flex w-full items-center gap-2 rounded-md p-2 text-right ${active ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-accent'}`}
                    >
                      {photo ? (
                        <img src={photo} alt={p.property_title} className="h-12 w-12 rounded-md object-cover" />
                      ) : (
                        <span className="h-12 w-12 rounded-md bg-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.property_title}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {[p.address, p.city].filter(Boolean).join(', ')}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {p.deal_type === 'rent' ? 'להשכרה' : p.deal_type === 'sale' ? 'למכירה' : 'סוג עסקה לא צוין'} · {p.rooms ? `${p.rooms} חדרים` : 'חדרים לא צוינו'}{p.sqm ? ` · ${p.sqm} מ״ר` : ''} · {formatPrice(p.asking_price)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>תאריך</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>שעה</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>הערות</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים לסיור" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendWa} onCheckedChange={(v) => setSendWa(!!v)} />
            שליחת אישור בוואטסאפ
          </label>
        </div>

        <DialogFooter className="flex-row justify-between gap-2 space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            קביעת סיור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewTourDialog;
