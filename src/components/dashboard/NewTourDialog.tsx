/**
 * NewTourDialog
 * -------------
 * End-to-end flow for scheduling a new property tour:
 * pick an existing contact from the CRM (or create one on the spot with the +
 * button inside the search field) -> pick a property (the list stays collapsed
 * until the broker types a search) -> date & time -> optional WhatsApp
 * confirmation and an optional digital-signature form, both sent from the
 * OFFICIAL Meta WBA number only (see src/lib/officialWa.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { sendViaOfficialWaba } from '@/lib/officialWa';
import { publicUrl } from '@/lib/publicUrl';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import NewLeadDialog from '@/components/leads/NewLeadDialog';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';

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

/** Signature templates the broker can send to the client before the tour. */
type SignatureTemplate = 'tour_agreement' | 'offer_letter' | 'lease_agreement';

const SIGNATURE_FORMS: { value: SignatureTemplate; label: string }[] = [
  { value: 'tour_agreement', label: 'הסכם סיור בנכס' },
  { value: 'offer_letter', label: 'הצעת רכישה' },
  { value: 'lease_agreement', label: 'חוזה שכירות' },
];

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

export type EditableTour = {
  id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  scheduled_at: string;
  property_title: string | null;
  property_address: string | null;
  listing_id: string | null;
  notes: string | null;
};

export function NewTourDialog({ open, onOpenChange, tour = null }: { open: boolean; onOpenChange: (v: boolean) => void; tour?: EditableTour | null }) {
  const qc = useQueryClient();
  const ownerId = useActiveWorkspaceOwnerId();

  const [contactQuery, setContactQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [listingQuery, setListingQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<ListingOption | null>(null);
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [sendWa, setSendWa] = useState(true);
  const [sendSignature, setSendSignature] = useState(false);
  const [signatureForm, setSignatureForm] = useState<SignatureTemplate>('tour_agreement');
  const [dealType, setDealType] = useState<'sale' | 'rent'>('sale');
  const [commissionMode, setCommissionMode] = useState<'percent' | 'fixed' | 'first_month'>('percent');
  const [commissionPercent, setCommissionPercent] = useState('2');
  const [commissionAmount, setCommissionAmount] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !tour) return;
    const scheduled = new Date(tour.scheduled_at);
    const p = (n: number) => String(n).padStart(2, '0');
    setSelectedLead({ id: '', full_name: tour.client_name, phone_number: tour.client_phone, email: tour.client_email, profile_picture_url: null });
    setSelectedListing(tour.listing_id ? { id: tour.listing_id, property_title: tour.property_title || 'נכס', address: tour.property_address, city: null, image_url: null, media_photos: [], rooms: null, sqm: null, asking_price: null, deal_type: null } : null);
    setDate(`${scheduled.getFullYear()}-${p(scheduled.getMonth() + 1)}-${p(scheduled.getDate())}`);
    setTime(`${p(scheduled.getHours())}:${p(scheduled.getMinutes())}`);
    setNotes(tour.notes ?? '');
    setSendWa(false);
    setSendSignature(false);
  }, [open, tour]);

  const { data: leads = [] } = useQuery({
    queryKey: ['new-tour-leads', ownerId, contactQuery],
    enabled: !!ownerId && open && contactQuery.trim().length >= 2,
    queryFn: async () => {
      if (!ownerId) return [];
      const q = contactQuery.trim();
      const { data } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, email, profile_picture_url')
        .eq('workspace_owner_id', ownerId)
        .or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`)
        .limit(8);
      return (data ?? []) as LeadOption[];
    },
  });

  // The property list is intentionally search-driven: nothing loads (and
  // nothing renders) until the broker types at least two characters.
  const listingSearch = listingQuery.trim();
  const { data: listings = [], isFetching: listingsLoading } = useQuery({
    queryKey: ['new-tour-listings', ownerId, listingSearch],
    enabled: !!ownerId && open && listingSearch.length >= 2,
    queryFn: async () => {
      if (!ownerId) return [];
      const { data } = await supabase
        .from('listings')
        .select('id, property_title, address, city, image_url, media_photos, rooms, sqm, asking_price, deal_type')
        .eq('workspace_owner_id', ownerId)
        .or(`property_title.ilike.%${listingSearch}%,address.ilike.%${listingSearch}%,city.ilike.%${listingSearch}%`)
        .order('created_at', { ascending: false })
        .limit(8);
      return (data ?? []) as ListingOption[];
    },
  });

  const propertyLabel = useMemo(() => {
    if (!selectedListing) return '';
    return [selectedListing.property_title, selectedListing.address, selectedListing.city].filter(Boolean).join(', ');
  }, [selectedListing]);

  const pickLead = (l: LeadOption) => {
    setSelectedLead(l);
    setContactQuery('');
  };

  const reset = () => {
    setContactQuery('');
    setSelectedLead(null);
    setListingQuery('');
    setSelectedListing(null);
    setDate(defaultDate());
    setTime('17:00');
    setNotes('');
    setSendWa(true);
    setSendSignature(false);
    setSignatureForm('tour_agreement');
  };

  /**
   * Edge errors arrive as a generic "non-2xx status code" — read the response
   * body so the broker sees the real reason a form failed to send.
   */
  const edgeMessage = async (err: any, fallback: string): Promise<string> => {
    try {
      const res = err?.context;
      if (res && typeof res.clone === 'function') {
        const j = await res.clone().json();
        const e = j?.error;
        if (typeof e === 'string') return e;
        if (e?.fieldErrors) return Object.values(e.fieldErrors).flat().join(', ');
        if (j?.details) return String(j.details);
      }
    } catch { /* body already consumed or not JSON */ }
    return err?.message || fallback;
  };

  /** Generates the chosen form and sends its secure signature link on WhatsApp. */
  const sendSignatureForm = async (leadId: string, scheduledAt: Date) => {

    const { data: gen, error: genErr } = await supabase.functions.invoke('generate-closing-doc', {
      body: {
        lead_id: leadId,
        template_key: signatureForm,
        listing_id: selectedListing?.id || undefined,
        tour_date: signatureForm === 'tour_agreement' ? scheduledAt.toISOString() : undefined,
        deal_type: dealType,
        commission_mode: commissionMode,
        commission_percent:
          commissionMode === 'percent' && commissionPercent ? Number(commissionPercent) : undefined,
        commission_amount:
          commissionMode === 'fixed' && commissionAmount ? Number(commissionAmount) : undefined,

      },
    });
    if (genErr) throw new Error(await edgeMessage(genErr, 'הפקת המסמך נכשלה'));
    const documentId = (gen as any)?.document_id;
    if (!documentId) throw new Error('לא הוחזר מזהה מסמך');
    const { data: sendRes, error: sendErr } = await supabase.functions.invoke('send-closing-doc', {
      body: { document_id: documentId, site_url: publicUrl('').replace(/\/$/, '') },
    });
    if (sendErr) throw new Error(await edgeMessage(sendErr, 'שליחת המסמך נכשלה'));

    if ((sendRes as any)?.success === false) throw new Error((sendRes as any)?.error || 'שליחת המסמך נכשלה');
  };

  const submit = async () => {
    if (!ownerId) return;
    if (!selectedLead) {
      toast.error('יש לבחור איש קשר מהמאגר או להוסיף חדש');
      return;
    }
    if (!date || !time) {
      toast.error('נדרשים תאריך ושעה לסיור');
      return;
    }
    const name = (selectedLead.full_name || '').trim();
    const phone = (selectedLead.phone_number || '').trim();
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00+03:00`);
      const payload = {
        owner_id: ownerId,
        client_name: name,
        client_phone: phone,
        client_email: selectedLead.email || null,
        listing_id: selectedListing?.id ?? null,
        property_title: selectedListing?.property_title ?? null,
        property_address: [selectedListing?.address, selectedListing?.city].filter(Boolean).join(', ') || null,
        scheduled_at: scheduledAt.toISOString(),
        notes: notes.trim() || null,
        timezone: 'Asia/Jerusalem',
      };
      const request = tour
        ? supabase.from('property_tours').update(payload).eq('id', tour.id).eq('owner_id', ownerId)
        : supabase.from('property_tours').insert({
            ...payload,
            // A new tour is pending until the client explicitly accepts it.
            status: 'pending',
          });
      const { data: created, error } = await request.select('id').maybeSingle();
      if (error) throw error;

      if (sendWa) {
        // Client gets the proposed time plus a one-tap approval link; the broker
        // gets a reminder. The calendar event is written only once the client
        // approves (tour-confirm).
        const { data: notified, error: notifyErr } = await supabase.functions.invoke('tour-notify', {
          body: { tour_id: (created as any)?.id },
        });
        if (notifyErr || (notified as any)?.ok === false) {
          toast.error('הסיור נשמר, אך שליחת ההודעות בוואטסאפ נכשלה');
        } else {
          toast.success('נשלחה בקשת אישור מועד ללקוח ותזכורת למתווך');
        }
      }

      if (sendSignature) {
        try {
          await sendSignatureForm(selectedLead.id, scheduledAt);
          toast.success('הטופס לחתימה דיגיטלית נשלח בוואטסאפ');
        } catch (e: any) {
          toast.error('הסיור נשמר, אך שליחת הטופס לחתימה נכשלה', { description: e?.message });
        }
      }

      toast.success(tour ? 'הסיור עודכן' : 'הסיור נקבע');
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
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tour ? 'עריכת סיור' : 'סיור חדש'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>איש קשר</Label>
              {selectedLead ? (
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <ContactAvatar
                    name={selectedLead.full_name ?? ''}
                    imageUrl={selectedLead.profile_picture_url}
                    className="h-8 w-8"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{selectedLead.full_name || 'ללא שם'}</span>
                    <span className="block text-[14px] text-muted-foreground">
                      {formatPhoneDisplay(selectedLead.phone_number)}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedLead(null)} title="בחירת איש קשר אחר">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10 pr-9"
                      placeholder="חיפוש לפי שם או טלפון"
                      value={contactQuery}
                      onChange={(e) => setContactQuery(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute left-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      title="הוספת איש קשר חדש"
                      onClick={() => setNewContactOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
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
                            <span className="block text-[14px] text-muted-foreground">{formatPhoneDisplay(l.phone_number)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
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
              {selectedListing ? (
                <div className="flex items-center gap-2 rounded-md border p-2">
                  {listingPhoto(selectedListing) ? (
                    <img
                      src={listingPhoto(selectedListing) as string}
                      alt={selectedListing.property_title}
                      className="h-12 w-12 rounded-md object-cover"
                    />
                  ) : (
                    <span className="h-12 w-12 rounded-md bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{selectedListing.property_title}</span>
                    <span className="block truncate text-[14px] text-muted-foreground">
                      {[selectedListing.address, selectedListing.city].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedListing(null)} title="הסרת הנכס">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : listingSearch.length >= 2 ? (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
                  {listingsLoading ? (
                    <p className="p-2 text-[14px] text-muted-foreground">מחפש נכסים…</p>
                  ) : listings.length === 0 ? (
                    <p className="p-2 text-[14px] text-muted-foreground">לא נמצאו נכסים</p>
                  ) : (
                    listings.map((p) => {
                      const photo = listingPhoto(p);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSelectedListing(p); setListingQuery(''); }}
                          className="flex w-full items-center gap-2 rounded-md p-2 text-right hover:bg-accent"
                        >
                          {photo ? (
                            <img src={photo} alt={p.property_title} className="h-12 w-12 rounded-md object-cover" />
                          ) : (
                            <span className="h-12 w-12 rounded-md bg-muted" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.property_title}</span>
                            <span className="block truncate text-[14px] text-muted-foreground">
                              {[p.address, p.city].filter(Boolean).join(', ')}
                            </span>
                            <span className="block truncate text-[14px] text-muted-foreground">
                              {p.deal_type === 'rent' ? 'להשכרה' : p.deal_type === 'sale' ? 'למכירה' : 'סוג עסקה לא צוין'} · {p.rooms ? `${p.rooms} חדרים` : 'חדרים לא צוינו'}{p.sqm ? ` · ${p.sqm} מ״ר` : ''} · {formatPrice(p.asking_price)}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
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
              <div className="flex items-center justify-between gap-2">
                <Label>הערות</Label>
                <VoiceInputButton size="sm" language="auto" onTranscript={(value) => setNotes((current) => current ? `${current} ${value}` : value)} />
              </div>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים לסיור" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendWa} onCheckedChange={(v) => setSendWa(!!v)} />
              שליחת אישור בוואטסאפ
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={sendSignature} onCheckedChange={(v) => setSendSignature(!!v)} />
                שליחת טופס לחתימה דיגיטלית בוואטסאפ
              </label>
              {sendSignature ? (
                <div className="space-y-2">
                  <Select value={signatureForm} onValueChange={(v) => setSignatureForm(v as SignatureTemplate)}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחירת טופס" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIGNATURE_FORMS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Deal type + commission terms printed in the form's fee clause. */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">סוג עסקה</Label>
                      <Select value={dealType} onValueChange={(v) => setDealType(v as 'sale' | 'rent')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sale">מכירה</SelectItem>
                          <SelectItem value="rent">שכירות</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">דמי תיווך</Label>
                      <Select
                        value={commissionMode}
                        onValueChange={(v) => setCommissionMode(v as 'percent' | 'fixed' | 'first_month')}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {dealType === 'rent' && <SelectItem value="first_month">חודש שכירות אחד</SelectItem>}
                          <SelectItem value="percent">אחוז ממחיר העסקה</SelectItem>
                          <SelectItem value="fixed">סכום קבוע</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {commissionMode === 'percent' && (
                    <Input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      placeholder="אחוז דמי תיווך, לדוגמה 2"
                      value={commissionPercent}
                      onChange={(e) => setCommissionPercent(e.target.value)}
                    />
                  )}
                  {commissionMode === 'fixed' && (
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="סכום דמי תיווך ב-₪"
                      value={commissionAmount}
                      onChange={(e) => setCommissionAmount(e.target.value)}
                    />
                  )}
                </div>
              ) : null}

            </div>
          </div>

          <DialogFooter className="flex-row justify-between gap-2 space-x-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
              {tour ? 'שמירת שינויים' : 'קביעת סיור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blank CRM contact form opened by the + inside the search field. The tour
          dialog stays open, so the broker keeps filling the tour right after. */}
      <NewLeadDialog
        open={newContactOpen}
        onOpenChange={setNewContactOpen}
        onCreated={(lead) => {
          setSelectedLead({
            id: lead.id,
            full_name: lead.full_name,
            phone_number: lead.phone_number,
            email: lead.email,
            profile_picture_url: null,
          });
          setContactQuery('');
          setNewContactOpen(false);
        }}
      />
    </>
  );
}

export default NewTourDialog;
