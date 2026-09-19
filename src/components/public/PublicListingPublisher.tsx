// "פרסום חינם" — multi-step listing wizard (Yad2-style flow) for the public board.
// Every step is saved to an IndexedDB draft, so an unauthenticated visitor can fill
// everything, sign up through /auth, and have the listing auto-published on return.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Film, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { uploadMediaToLibrary } from '@/lib/mediaUpload';
import {
  EMPTY_PUBLIC_LISTING_DRAFT,
  clearPublicListingDraft,
  readPublicListingDraft,
  savePublicListingDraft,
  type PublicListingDraftFields,
} from '@/lib/publicListingDraft';
import { setPendingSignupRole } from '@/lib/signupRole';
import AddressAutocomplete from '@/components/public/listing-wizard/AddressAutocomplete';

const PROPERTY_TYPES = ['דירה', 'דירת גן', 'פנטהאוז', 'דופלקס', 'בית פרטי', 'מיני פנטהאוז', 'סטודיו', 'מגרש', 'משרד', 'חנות', 'מחסן'];
const CONDITIONS = ['חדש מקבלן', 'חדש', 'משופץ', 'שמור', 'דרוש שיפוץ'];
const AIR_DIRECTIONS = ['1', '2', '3', '4'];
const ROOM_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6+'];

const STEP_TITLES = [
  'סוג המפרסם',
  'סוג העסקה',
  'סוג הנכס',
  'כתובת ומיקום',
  'פרטי הנכס',
  'תשלומים ומידות',
  'תמונות וסרטונים',
  'פרטי התקשרות',
];

function slugFor(userId: string) {
  return `owner-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
}

function ChoiceGrid({ options, value, onPick, columns = 3 }: { options: string[]; value: string; onPick: (option: string) => void; columns?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <Button key={option} type="button" size="sm" variant={value === option ? 'default' : 'outline'} onClick={() => onPick(option)}>
          {option}
        </Button>
      ))}
    </div>
  );
}

export function PublicListingPublisher({ autoResume = false, disabled = false }: { autoResume?: boolean; disabled?: boolean }) {
  const { user } = useAuth();
  const { isPropertyOwner, refetch: refetchRoles } = useUserRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<PublicListingDraftFields>(EMPTY_PUBLIC_LISTING_DRAFT);
  const [files, setFiles] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [resumed, setResumed] = useState(false);

  const set = <K extends keyof PublicListingDraftFields>(key: K, value: PublicListingDraftFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const addressLine = useMemo(
    () => [fields.street, fields.houseNumber].filter(Boolean).join(' ') || fields.address,
    [fields.street, fields.houseNumber, fields.address],
  );

  const publish = async (draftFields = fields, draftFiles = files, draftVideos = videos) => {
    if (!user?.id || publishing) return;
    if (!draftFields.city.trim() || !(draftFields.street.trim() || draftFields.address.trim()) || !draftFields.propertyType.trim() || !draftFields.price) {
      toast.error('יש למלא סוג נכס, עיר, כתובת ומחיר');
      return;
    }
    setPublishing(true);
    try {
      if (!isPropertyOwner) {
        const { error } = await supabase.rpc('register_as_property_owner', { _display_name: draftFields.contactName.trim() || null });
        if (error) throw error;
        await refetchRoles();
      }
      const photos: string[] = [];
      const clips: string[] = [];
      for (const file of [...draftFiles, ...draftVideos]) {
        const row = await uploadMediaToLibrary({ userId: user.id, fileName: file.name, data: file, mimeType: file.type, source: 'public_property_listing' });
        const url = (row as { public_url?: string | null })?.public_url;
        if (!url) continue;
        if (file.type.startsWith('video/')) clips.push(url); else photos.push(url);
      }
      const street = draftFields.street.trim();
      const address = [street, draftFields.houseNumber.trim()].filter(Boolean).join(' ') || draftFields.address.trim();
      const title = `${draftFields.propertyType.trim()} · ${draftFields.city.trim()}${draftFields.neighborhood.trim() ? ` · ${draftFields.neighborhood.trim()}` : ''}`;
      const { data, error } = await supabase.from('listings').insert({
        user_id: user.id, workspace_owner_id: user.id, owner_id: user.id,
        slug: slugFor(user.id), property_title: title, description: draftFields.description.trim(), asking_price: Number(draftFields.price),
        city: draftFields.city.trim(), neighborhood: draftFields.neighborhood.trim() || null, address,
        house_number: draftFields.houseNumber.trim() || null,
        apartment_number: draftFields.apartmentNumber.trim() || null,
        deal_type: draftFields.dealType, rooms: draftFields.rooms ? Number(draftFields.rooms.replace('+', '')) : null,
        sqm: draftFields.sqm ? Number(draftFields.sqm) : (draftFields.builtSqm ? Number(draftFields.builtSqm) : null),
        floor: draftFields.floor ? Number(draftFields.floor) : null,
        features: {
          property_type: draftFields.propertyType.trim(),
          publisher_type: draftFields.publisherType,
          total_floors: draftFields.totalFloors || null,
          elevator: draftFields.elevator,
          parking: draftFields.parking,
          balcony: draftFields.balcony,
          condition: draftFields.condition || null,
          air_directions: draftFields.airDirections || null,
          open_view: draftFields.openView,
          arnona: draftFields.arnona || null,
          vaad_bayit: draftFields.vaadBayit || null,
          built_sqm: draftFields.builtSqm || null,
          garden_sqm: draftFields.gardenSqm || null,
          entry_date: draftFields.entryDate || null,
          area: draftFields.area || null,
          district: draftFields.district || null,
          contact_name: draftFields.contactName || null,
          contact_whatsapp: draftFields.contactWhatsapp || null,
        },
        media_photos: photos, image_url: photos[0] ?? null,
        status: 'live', source: 'manual', is_published: true, affiliate_enabled: true,
      } as never).select('id').single();
      if (error) throw error;
      await clearPublicListingDraft();
      toast.success('הנכס פורסם בלוח השיתופי');
      setOpen(false); setFields(EMPTY_PUBLIC_LISTING_DRAFT); setFiles([]); setVideos([]); setStep(0);
      navigate('/owner/properties', { replace: true, state: { publishedListingId: (data as { id?: string } | null)?.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message.includes('one active property') || message.includes('duplicate') ? 'בעל נכס פרטי יכול לפרסם נכס פעיל אחד בלבד' : 'פרסום הנכס נכשל, הטיוטה נשמרה');
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (!autoResume || !user?.id || resumed) return;
    setResumed(true);
    void readPublicListingDraft().then((draft) => {
      if (!draft) return;
      setFields(draft); setFiles(draft.files ?? []); setVideos(draft.videos ?? []);
      void publish(draft, draft.files ?? [], draft.videos ?? []);
    });
  }, [autoResume, user?.id, resumed]);

  const goNext = async () => {
    try { await savePublicListingDraft(fields, files, videos); } catch { /* draft saving is best-effort */ }
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const submit = async () => {
    if (!fields.city.trim() || !(fields.street.trim() || fields.address.trim()) || !fields.propertyType.trim() || !fields.price) {
      toast.error('יש למלא סוג נכס, עיר, כתובת ומחיר'); return;
    }
    if (!fields.contactName.trim() || fields.contactWhatsapp.replace(/\D/g, '').length < 9) {
      toast.error('יש למלא שם ומספר ווטסאפ'); return;
    }
    if (!fields.termsAccepted) { toast.error('יש לאשר את התקנון'); return; }
    try {
      await savePublicListingDraft(fields, files, videos);
      if (!user) { setPendingSignupRole('property_owner'); navigate('/auth'); return; }
      await publish();
    } catch { toast.error('לא ניתן לשמור את הטיוטה בדפדפן'); }
  };

  const isLast = step === STEP_TITLES.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} className="font-bold bg-success text-success-foreground hover:bg-success/90">פרסום חינם</Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>
            <span className="me-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-success text-xs font-bold text-success">{step + 1}</span>
            {STEP_TITLES[step]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={fields.publisherType === 'broker' ? 'default' : 'outline'} onClick={() => set('publisherType', 'broker')}>מתווך</Button>
              <Button type="button" variant={fields.publisherType === 'private' ? 'default' : 'outline'} onClick={() => set('publisherType', 'private')}>פרטי</Button>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {([['rent', 'השכרה'], ['sale', 'מכירה']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('dealType', value)}
                  className={`rounded-lg border p-6 text-center text-base font-bold ${fields.dealType === value ? 'border-success bg-success/10 text-success' : 'border-border bg-card'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {step === 2 && <ChoiceGrid options={PROPERTY_TYPES} value={fields.propertyType} onPick={(option) => set('propertyType', option)} />}

          {step === 3 && (
            <div className="space-y-3">
              <AddressAutocomplete
                value={addressLine}
                onPick={(place) => setFields((current) => ({
                  ...current,
                  street: place.street || current.street,
                  houseNumber: place.house_number || current.houseNumber,
                  neighborhood: place.neighborhood || current.neighborhood,
                  city: place.city || current.city,
                  area: place.area || current.area,
                  district: place.district || current.district,
                  address: place.formatted_address || current.address,
                }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>עיר *</Label><Input value={fields.city} onChange={(e) => set('city', e.target.value)} /></div>
                <div><Label>רחוב *</Label><Input value={fields.street} onChange={(e) => set('street', e.target.value)} /></div>
                <div><Label>מספר בית</Label><Input inputMode="numeric" value={fields.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} /></div>
                <div><Label>מספר דירה</Label><Input inputMode="numeric" value={fields.apartmentNumber} onChange={(e) => set('apartmentNumber', e.target.value)} /></div>
                <div><Label>שכונה</Label><Input value={fields.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>
                <div><Label>אזור</Label><Input value={fields.area} onChange={(e) => set('area', e.target.value)} /></div>
                <div><Label>מחוז</Label><Input value={fields.district} onChange={(e) => set('district', e.target.value)} /></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div><Label>מספר חדרים</Label><ChoiceGrid options={ROOM_OPTIONS} value={fields.rooms} onPick={(option) => set('rooms', option)} columns={6} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>קומה</Label><Input inputMode="numeric" value={fields.floor} onChange={(e) => set('floor', e.target.value.replace(/[^\d-]/g, ''))} /></div>
                <div><Label>מתוך כמה קומות בבניין</Label><Input inputMode="numeric" value={fields.totalFloors} onChange={(e) => set('totalFloors', e.target.value.replace(/\D/g, ''))} /></div>
              </div>
              <div className="flex flex-wrap gap-4">
                {([['elevator', 'מעלית'], ['parking', 'חניה'], ['balcony', 'מרפסת'], ['openView', 'נוף פתוח']] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm font-semibold">
                    <Checkbox checked={Boolean(fields[key])} onCheckedChange={(checked) => set(key, Boolean(checked))} />
                    {label}
                  </label>
                ))}
              </div>
              <div><Label>מצב הנכס</Label><ChoiceGrid options={CONDITIONS} value={fields.condition} onPick={(option) => set('condition', option)} /></div>
              <div><Label>כיווני אוויר</Label><ChoiceGrid options={AIR_DIRECTIONS} value={fields.airDirections} onPick={(option) => set('airDirections', option)} columns={4} /></div>
              <div><Label>תיאור הנכס</Label><Textarea rows={3} value={fields.description} onChange={(e) => set('description', e.target.value)} /></div>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>ארנונה לחודשיים</Label><Input inputMode="numeric" value={fields.arnona} onChange={(e) => set('arnona', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>ועד בית</Label><Input inputMode="numeric" value={fields.vaadBayit} onChange={(e) => set('vaadBayit', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>מ״ר בנוי</Label><Input inputMode="numeric" value={fields.builtSqm} onChange={(e) => set('builtSqm', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>מ״ר גינה</Label><Input inputMode="numeric" value={fields.gardenSqm} onChange={(e) => set('gardenSqm', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>גודל במ״ר סך הכל</Label><Input inputMode="numeric" value={fields.sqm} onChange={(e) => set('sqm', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>מחיר *</Label><Input inputMode="numeric" value={fields.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>תאריך כניסה</Label><Input type="date" value={fields.entryDate} onChange={(e) => set('entryDate', e.target.value)} /></div>
            </div>
          )}

          {step === 6 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="wizard-photos" className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                  <ImagePlus className="h-6 w-6" />
                  {files.length ? `${files.length} תמונות נבחרו` : 'לחיצה או גרירה להעלאת תמונות'}
                </Label>
                <input
                  id="wizard-photos" type="file" accept="image/*" multiple className="sr-only"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 20))}
                />
              </div>
              <div>
                <Label htmlFor="wizard-videos" className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                  <Film className="h-6 w-6" />
                  {videos.length ? `${videos.length} סרטונים נבחרו` : 'לחיצה או גרירה להעלאת סרטון'}
                </Label>
                <input
                  id="wizard-videos" type="file" accept="video/*" multiple className="sr-only"
                  onChange={(e) => setVideos(Array.from(e.target.files ?? []).slice(0, 3))}
                />
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">באיזה מספר המתעניינים יוכלו להשיג אותך?</p>
              <div><Label>השם שלך *</Label><Input value={fields.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
              <div><Label>מספר ווטסאפ *</Label><Input inputMode="tel" placeholder="05X-XXXXXXX" value={fields.contactWhatsapp} onChange={(e) => set('contactWhatsapp', e.target.value)} /></div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={fields.marketingAccepted} onCheckedChange={(checked) => set('marketingAccepted', Boolean(checked))} />
                אני רוצה לקבל פניות ועדכונים שיווקיים
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={fields.termsAccepted} onCheckedChange={(checked) => set('termsAccepted', Boolean(checked))} />
                אני מאשר/ת את התקנון ומדיניות הפרטיות
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            <ArrowRight className="h-4 w-4" /> חזרה
          </Button>
          {isLast ? (
            <Button type="button" disabled={publishing} onClick={() => void submit()} className="bg-success text-success-foreground hover:bg-success/90">
              {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> מפרסם…</> : user ? 'פרסום הנכס' : 'הרשמה ופרסום'}
            </Button>
          ) : (
            <Button type="button" onClick={() => void goNext()}>לשלב הבא <ArrowLeft className="h-4 w-4" /></Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PublicListingPublisher;
