// "פרסום חינם" — multi-step listing wizard (Yad2-style flow) for the public board.
// Every step is saved to an IndexedDB draft, so an unauthenticated visitor can fill
// everything, sign up through /auth, and have the listing auto-published on return.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Film, ImagePlus, Loader2, X } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PROPERTY_TYPES = ['דירה', 'דירת גן', 'פנטהאוז', 'דופלקס', 'בית פרטי', 'מיני פנטהאוז', 'סטודיו', 'מגרש', 'משרד', 'חנות', 'מחסן'];
const CONDITIONS = ['חדש מקבלן', 'חדש', 'משופץ', 'שמור', 'דרוש שיפוץ'];
const AIR_DIRECTIONS = ['1', '2', '3', '4'];
const ROOM_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6+'];
const FLOOR_OPTIONS = ['קרקע', ...Array.from({ length: 50 }, (_, index) => String(index + 1))];
const TOTAL_FLOOR_OPTIONS = Array.from({ length: 50 }, (_, index) => String(index + 1));
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

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
  const [publishStage, setPublishStage] = useState('');
  const [publishError, setPublishError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const previews = useMemo(() => [...files, ...videos].map((file) => ({ file, url: URL.createObjectURL(file) })), [files, videos]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

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
    setPublishError('');
    try {
      setPublishStage('השלמת הרשאת מפרסם');
      if (!isPropertyOwner) {
        const { error } = await supabase.rpc('register_as_property_owner', { _display_name: draftFields.contactName.trim() || null });
        if (error) throw error;
        await refetchRoles();
      }
      const photos: string[] = [];
      const clips: string[] = [];
      for (const file of [...draftFiles, ...draftVideos]) {
        setPublishStage(`העלאת ${file.name}`);
        let row: unknown;
        try {
          row = await uploadMediaToLibrary({ userId: user.id, fileName: file.name, data: file, mimeType: file.type, source: 'public_property_listing' });
        } catch (uploadError) {
          const reason = uploadError instanceof Error ? uploadError.message : 'שגיאת אחסון לא ידועה';
          throw new Error(`העלאת הקובץ "${file.name}" נכשלה: ${reason}`);
        }
        const url = (row as { public_url?: string | null })?.public_url;
        if (!url) continue;
        if (file.type.startsWith('video/')) clips.push(url); else photos.push(url);
      }
      const street = draftFields.street.trim();
      const address = [street, draftFields.houseNumber.trim()].filter(Boolean).join(' ') || draftFields.address.trim();
      const title = `${draftFields.propertyType.trim()} · ${draftFields.city.trim()}${draftFields.neighborhood.trim() ? ` · ${draftFields.neighborhood.trim()}` : ''}`;
      setPublishStage('שמירת פרטי הנכס');
      const { data, error } = await supabase.from('listings').insert({
        user_id: user.id, workspace_owner_id: user.id, owner_id: user.id,
        slug: slugFor(user.id), property_title: title, description: draftFields.description.trim(), asking_price: Number(draftFields.price),
        city: draftFields.city.trim(), neighborhood: draftFields.neighborhood.trim() || null, address,
        house_number: draftFields.houseNumber.trim() || null,
        apartment_number: draftFields.apartmentNumber.trim() || null,
         deal_type: draftFields.dealType, rooms: draftFields.rooms ? Number(draftFields.rooms.replace('+', '')) : null,
        sqm: draftFields.sqm ? Number(draftFields.sqm) : (draftFields.builtSqm ? Number(draftFields.builtSqm) : null),
         floor: draftFields.floor ? (draftFields.floor === 'קרקע' ? 0 : Number(draftFields.floor)) : null,
        features: {
          property_type: draftFields.propertyType.trim(),
          publisher_type: draftFields.publisherType,
          street: street || null,
          media_videos: clips,
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
       navigate('/public-listings', { replace: true, state: { publishedListingId: (data as { id?: string } | null)?.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאה לא ידועה';
      const friendly = message.includes('one active property') || message.includes('duplicate')
        ? 'בעל נכס פרטי יכול לפרסם נכס פעיל אחד בלבד'
        : message.includes('row-level security') || message.includes('permission')
          ? 'אין הרשאה לפרסם את הנכס בחשבון הזה'
          : message;
      const detailedError = `${publishStage || 'פרסום'}: ${friendly}`;
      setPublishError(detailedError);
      toast.error('פרסום הנכס נכשל והטיוטה נשמרה', { description: detailedError });
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

  const stepValid = () => {
    if (step === 2) return Boolean(fields.propertyType);
    if (step === 3) return Boolean(fields.city.trim() && (fields.street.trim() || fields.address.trim()));
    if (step === 4) return Boolean(fields.rooms && fields.floor && fields.totalFloors && fields.condition && fields.airDirections);
    if (step === 5) return Boolean(fields.price && (fields.sqm || fields.builtSqm));
    return true;
  };
  const goNext = async () => {
    if (!stepValid()) { toast.error('יש להשלים את שדות החובה לפני המעבר'); return; }
    try { await savePublicListingDraft(fields, files, videos); } catch { /* draft saving is best-effort */ }
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const pickAndAdvance = async <K extends 'publisherType' | 'dealType' | 'propertyType'>(key: K, value: PublicListingDraftFields[K]) => {
    const nextFields = { ...fields, [key]: value };
    setFields(nextFields);
    try { await savePublicListingDraft(nextFields, files, videos); } catch { /* best effort */ }
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const addMedia = (incoming: File[], kind: 'image' | 'video') => {
    const valid = incoming.filter((file) => {
      const expected = kind === 'image' ? file.type.startsWith('image/') : file.type.startsWith('video/');
      const maxSize = kind === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
      if (!expected) toast.error(`הקובץ ${file.name} אינו ${kind === 'image' ? 'תמונה' : 'סרטון'} תקין`);
      else if (file.size > maxSize) toast.error(`הקובץ ${file.name} גדול מדי`, { description: `הגודל המרבי הוא ${kind === 'image' ? '15MB' : '100MB'}.` });
      return expected && file.size <= maxSize;
    });
    const update = (current: File[], limit: number) => {
      const merged = [...current];
      for (const file of valid) {
        if (!merged.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) merged.push(file);
      }
      if (merged.length > limit) toast.error(`ניתן להעלות עד ${limit} קבצים מסוג זה`);
      return merged.slice(0, limit);
    };
    if (kind === 'image') setFiles((current) => update(current, 20));
    else setVideos((current) => update(current, 3));
  };

  const submit = async () => {
    if (!fields.city.trim() || !(fields.street.trim() || fields.address.trim()) || !fields.propertyType.trim() || !fields.price) {
      toast.error('יש למלא סוג נכס, עיר, כתובת ומחיר'); return;
    }
    if (!fields.contactName.trim() || fields.contactWhatsapp.replace(/\D/g, '').length < 9) {
      toast.error('יש למלא שם ומספר ווטסאפ'); return;
    }
    if (!fields.termsAccepted) { toast.error('יש לאשר את התקנון'); return; }
    if (!confirming) { setConfirming(true); return; }
    try {
      await savePublicListingDraft(fields, files, videos);
      if (!user) { setPendingSignupRole('property_owner'); navigate('/auth'); return; }
      await publish();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'שגיאת אחסון בדפדפן';
      setPublishError(`שמירת הטיוטה: ${reason}`);
      toast.error('לא ניתן לשמור את הטיוטה בדפדפן', { description: reason });
    }
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
          {publishError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-bold">הפרסום לא הושלם</p><p className="mt-1 break-words text-xs">{publishError}</p></div>}
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2">
               <Button type="button" variant="outline" onClick={() => void pickAndAdvance('publisherType', 'broker')}>מתווך</Button>
               <Button type="button" variant="outline" onClick={() => void pickAndAdvance('publisherType', 'private')}>פרטי</Button>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {([['rent', 'השכרה'], ['sale', 'מכירה']] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  onClick={() => void pickAndAdvance('dealType', value)}
                  className="h-auto p-6 text-center text-base font-bold"
                >
                  {label}
                </Button>
              ))}
            </div>
          )}

          {step === 2 && <ChoiceGrid options={PROPERTY_TYPES} value={fields.propertyType} onPick={(option) => void pickAndAdvance('propertyType', option)} />}

          {step === 3 && (
            <div className="space-y-3">
              <AddressAutocomplete
                value={addressLine}
                onPick={(place) => setFields((current) => ({
                  ...current,
                   street: place.street,
                   houseNumber: place.house_number,
                   neighborhood: place.neighborhood,
                   city: place.city,
                   area: place.area,
                   address: place.formatted_address,
                }))}
              />
              {fields.address && <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>עיר *</Label><Input value={fields.city} onChange={(e) => set('city', e.target.value)} /></div>
                <div><Label>רחוב *</Label><Input value={fields.street} onChange={(e) => set('street', e.target.value)} /></div>
                <div><Label>מספר בית</Label><Input inputMode="numeric" value={fields.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} /></div>
                <div><Label>מספר דירה</Label><Input inputMode="numeric" value={fields.apartmentNumber} onChange={(e) => set('apartmentNumber', e.target.value)} /></div>
                {fields.neighborhood && <div><Label>שכונה</Label><Input value={fields.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>}
                {fields.area && <div><Label>אזור</Label><Input value={fields.area} onChange={(e) => set('area', e.target.value)} /></div>}
              </div>}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div><Label>קומות בבניין</Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={fields.rooms} onValueChange={(value) => set('rooms', value)}><SelectTrigger><SelectValue placeholder="חדרים" /></SelectTrigger><SelectContent>{ROOM_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option} חדרים</SelectItem>)}</SelectContent></Select>
                <Select value={fields.floor} onValueChange={(value) => set('floor', value)}><SelectTrigger><SelectValue placeholder="קומה" /></SelectTrigger><SelectContent>{FLOOR_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option === 'קרקע' ? option : `קומה ${option}`}</SelectItem>)}</SelectContent></Select>
                <Select value={fields.totalFloors} onValueChange={(value) => set('totalFloors', value)}><SelectTrigger><SelectValue placeholder="מתוך" /></SelectTrigger><SelectContent>{TOTAL_FLOOR_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option} קומות</SelectItem>)}</SelectContent></Select>
              </div>
              </div>
              <div className="flex flex-wrap gap-4">
                {([['elevator', 'מעלית'], ['parking', 'חניה'], ['balcony', 'מרפסת'], ['openView', 'נוף פתוח']] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm font-semibold">
                    <Checkbox checked={Boolean(fields[key])} onCheckedChange={(checked) => set(key, Boolean(checked))} />
                    {label}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3"><div><Label>מצב הנכס *</Label><Select value={fields.condition} onValueChange={(value) => set('condition', value)}><SelectTrigger><SelectValue placeholder="בחירה" /></SelectTrigger><SelectContent>{CONDITIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div><div><Label>כיווני אוויר *</Label><Select value={fields.airDirections} onValueChange={(value) => set('airDirections', value)}><SelectTrigger><SelectValue placeholder="בחירה" /></SelectTrigger><SelectContent>{AIR_DIRECTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div></div>
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
                   onChange={(e) => { addMedia(Array.from(e.target.files ?? []), 'image'); e.target.value = ''; }}
                />
              </div>
              <div>
                <Label htmlFor="wizard-videos" className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                  <Film className="h-6 w-6" />
                  {videos.length ? `${videos.length} סרטונים נבחרו` : 'לחיצה או גרירה להעלאת סרטון'}
                </Label>
                <input
                  id="wizard-videos" type="file" accept="video/*" multiple className="sr-only"
                   onChange={(e) => { addMedia(Array.from(e.target.files ?? []), 'video'); e.target.value = ''; }}
                />
               {previews.length > 0 && <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{previews.map(({ file, url }) => <div key={`${file.name}-${file.size}-${file.lastModified}`} className="relative aspect-video overflow-hidden rounded-md border bg-muted">{file.type.startsWith('video/') ? <video src={url} controls className="h-full w-full object-cover" /> : <img src={url} alt={file.name} className="h-full w-full object-cover" />}<Button type="button" size="icon" variant="secondary" className="absolute end-1 top-1 h-7 w-7" aria-label={`הסרת ${file.name}`} onClick={() => { setFiles((current) => current.filter((item) => item !== file)); setVideos((current) => current.filter((item) => item !== file)); }}><X className="h-4 w-4" /></Button></div>)}</div>}
             </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <div><Label>השם שלך *</Label><Input value={fields.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
              <div><Label>מספר ווטסאפ *</Label><Input inputMode="tel" value={fields.contactWhatsapp} onChange={(e) => set('contactWhatsapp', e.target.value)} /></div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={fields.marketingAccepted} onCheckedChange={(checked) => set('marketingAccepted', Boolean(checked))} />
                אני רוצה לקבל פניות ועדכונים שיווקיים
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={fields.termsAccepted} onCheckedChange={(checked) => set('termsAccepted', Boolean(checked))} />
                 <span>אני מאשר/ת את <a href="/terms" target="_blank" className="font-semibold text-primary underline">התקנון</a> ואת <a href="/privacy" target="_blank" className="font-semibold text-primary underline">מדיניות הפרטיות</a></span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
           {step > 0 ? <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(0, current - 1))}>
            <ArrowRight className="h-4 w-4" /> חזרה
           </Button> : <span />}
          {isLast ? (
            <Button type="button" disabled={publishing} onClick={() => void submit()} className="bg-success text-success-foreground hover:bg-success/90">
              {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> מפרסם…</> : user ? 'פרסום הנכס' : 'הרשמה ופרסום'}
            </Button>
          ) : step > 1 ? (
            <Button type="button" onClick={() => void goNext()}>לשלב הבא <ArrowLeft className="h-4 w-4" /></Button>
          ) : <span />}
        </div>
      </DialogContent>
      <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent dir="rtl" className="sm:max-w-lg"><DialogHeader><DialogTitle className="text-right">אישור פרסום הנכס</DialogTitle></DialogHeader><div className="space-y-3">{previews[0] && <img src={previews[0].url} alt="תצוגת הנכס" className="aspect-video w-full rounded-md object-cover" />}<p className="text-lg font-bold">{fields.propertyType} · {[fields.street, fields.houseNumber, fields.city].filter(Boolean).join(' ')}</p><p className="font-bold text-primary">₪{Number(fields.price || 0).toLocaleString('he-IL')}</p><p className="text-sm text-muted-foreground">{[fields.rooms && `${fields.rooms} חדרים`, (fields.sqm || fields.builtSqm) && `${fields.sqm || fields.builtSqm} מ״ר`, fields.floor && `קומה ${fields.floor}`].filter(Boolean).join(' · ')}</p></div><div className="flex justify-between gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>חזרה לעריכה</Button><Button className="bg-success text-success-foreground hover:bg-success/90" disabled={publishing} onClick={() => void submit()}>{publishing ? 'מפרסם…' : 'אישור ופרסום'}</Button></div></DialogContent></Dialog>
    </Dialog>
  );
}

export default PublicListingPublisher;
