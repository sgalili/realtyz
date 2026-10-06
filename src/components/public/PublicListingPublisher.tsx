// "פרסום חינם" — multi-step listing wizard (Yad2-style flow) for the public board.
// Every step is saved to an IndexedDB draft, so an unauthenticated visitor can fill
// everything, sign up through /auth, and have the listing auto-published on return.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Film, HelpCircle, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { readRecentYad2Listing } from '@/lib/yad2LocalCache';
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
import { useWorkspace } from '@/hooks/useWorkspace';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { celebratePublication, preparePublicationSound } from '@/lib/publicationCelebration';
import { missingAdFields, missingPublishFields } from '@/lib/adRecovery';

const isVideoUrl = (s: unknown) => typeof s === 'string' && /\.(mp4|webm|mov|m3u8|m4v)(\?|#|$)/i.test(s);
const importedVideoUrls = (src: any): string[] => Array.from(new Set([...(Array.isArray(src?.videos) ? src.videos : []), ...(Array.isArray(src?.media_videos) ? src.media_videos : []), ...(src?.video_url ? [src.video_url] : []), ...(Array.isArray(src?.photos) ? src.photos.filter(isVideoUrl) : [])].filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)));

const PROPERTY_TYPES = ['דירה', 'דירת גן', 'פנטהאוז', 'דופלקס', 'בית פרטי', 'מיני פנטהאוז', 'סטודיו', 'מגרש', 'משרד', 'חנות', 'מחסן'];
const CONDITIONS = ['חדש מקבלן', 'חדש', 'משופץ', 'שמור', 'דרוש שיפוץ'];
const AIR_DIRECTIONS = ['1', '2', '3', '4'];
const ROOM_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6+'];
const FLOOR_OPTIONS = ['קרקע', ...Array.from({ length: 9 }, (_, index) => String(index + 1)), '10+'];
const TOTAL_FLOOR_OPTIONS = [...Array.from({ length: 9 }, (_, index) => String(index + 1)), '10+'];
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
  'עמלות ומגבלה יומית',
];

const LEAD_TYPES = [
  { key: 'Form', label: 'פנייה בטופס' },
  { key: 'Whatsapp', label: 'שיחה עם ריטה בווטסאפ' },
  { key: 'Phone', label: 'שיחת טלפון' },
] as const;

const LEAD_TYPE_VALIDITY = (
  <ul className="list-disc space-y-1 ps-5">
    <li>כל פנייה כוללת 3 שאלות סינון קצרות שהמפרסם קובע מראש.</li>
    <li>כל פנייה מגיעה עם תמליל מלא של השיחה, ובשיחות טלפון גם עם הקלטה.</li>
    <li>פנייה נספרת כפנייה תקפה (ונחייבת בעמלה) רק אם התשובות בשאלות הסינון חיוביות ומשביעות רצון.</li>
  </ul>
);

function LeadTypeHelp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={`הסבר על פנייה: ${label}`} className="inline-flex shrink-0 text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-right">{label}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Display Israeli mobile numbers as 05X-XXXXXXX. */
function formatIlPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  digits = digits.slice(0, 10);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
}

/** Store Israeli mobile numbers normalized as 9725XXXXXXXX. */
function normalizeIlPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('05') ? `972${digits.slice(1)}` : digits;
}

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

export function PublicListingPublisher({ autoResume = false, disabled = false, resumeDraft, onRecovered }: { autoResume?: boolean; disabled?: boolean; resumeDraft?: import('@/lib/publicListingDraft').PublicListingDraft; onRecovered?: () => void }) {
  const { user } = useAuth();
  const { activeWorkspaceId, activeWorkspace, setActiveWorkspace, refresh: refreshWorkspaces } = useWorkspace();
  const { isPropertyOwner, isAgent, isSuperAdmin, refetch: refetchRoles } = useUserRole();
  const { data: publisherProfile } = useQuery({
    queryKey: ['publisher-profile', user?.id, activeWorkspaceId],
    enabled: Boolean(user?.id && activeWorkspaceId),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from('profiles').select('full_name, phone, broker_license_number').eq('id', user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isBroker = Boolean(user && activeWorkspace && (isSuperAdmin || ['managing_broker', 'lead_agent', 'agent', 'junior_agent'].includes(activeWorkspace.role) || (activeWorkspace.is_self && (isAgent || publisherProfile?.broker_license_number))));
  const publisherName = publisherProfile?.full_name || user?.user_metadata?.full_name || '';
  const publisherPhone = publisherProfile?.phone || user?.phone || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [importSlide, setImportSlide] = useState(false);
  const [fields, setFields] = useState<PublicListingDraftFields>(EMPTY_PUBLIC_LISTING_DRAFT);
  const [files, setFiles] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [publishStage, setPublishStage] = useState('');
  const [publishError, setPublishError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Record<string, any> | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [expandedStep, setExpandedStep] = useState('step-0');
  const [addressResolved, setAddressResolved] = useState(false);
  const importInFlight = useRef(false);
  const lastAutoImport = useRef('');
  const [importStage, setImportStage] = useState('');
  const [myPropsSave, setMyPropsSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const initializedPublisher = useRef('');
  const publicationAudio = useRef<AudioContext | null>(null);
  const openedScope = useRef('');
  const draftScope = user?.id && activeWorkspaceId ? `${user.id}:${activeWorkspaceId}` : 'visitor';
  useEffect(() => {
    if (openedScope.current && openedScope.current !== draftScope && openedScope.current !== 'visitor') {
      setOpen(false); setFields(EMPTY_PUBLIC_LISTING_DRAFT); setFiles([]); setVideos([]); setPublishError('');
    }
    openedScope.current = draftScope;
  }, [draftScope]);
  const saveDraft = (f = fields, images = files, clips = videos) => savePublicListingDraft({ ...f, publicationError: f.publicationError || publishError, resumeStep: reviewMode ? Number(expandedStep.replace('step-', '')) || 0 : step }, images, clips, draftScope);
  useEffect(() => {
    if (!resumeDraft) return;
    setFields(resumeDraft); setFiles(resumeDraft.files || []); setVideos(resumeDraft.videos || []);
    setPublishError(resumeDraft.publicationError || ''); setStep(resumeDraft.resumeStep || 0);
    setReviewMode(true); setImportSlide(false); setExpandedStep(`step-${resumeDraft.resumeStep || 0}`); setOpen(true);
  }, [resumeDraft]);
  useEffect(() => {
    if (!open || publishing || importing) return;
    const timer = window.setTimeout(() => { void saveDraft().catch(() => {}); }, 350);
    return () => window.clearTimeout(timer);
  }, [fields, files, videos, step, expandedStep, open, draftScope, publishing, importing]);
  useEffect(() => {
    if (!open || !isBroker) return;
    const identity = `${user?.id}:${activeWorkspaceId}`;
    const changedWorkspace = Boolean(initializedPublisher.current && initializedPublisher.current !== identity);
    const first = initializedPublisher.current !== identity;
    initializedPublisher.current = identity;
    setFields(current => ({ ...current, publisherType: 'broker', contactName: changedWorkspace ? publisherName : current.contactName || publisherName, contactWhatsapp: changedWorkspace ? publisherPhone : current.contactWhatsapp || publisherPhone, marketingAccepted: first ? true : current.marketingAccepted }));
    if (first && step === 0 && !reviewMode) setImportSlide(true);
  }, [open, isBroker, user?.id, activeWorkspaceId, publisherName, publisherPhone, step, reviewMode]);
  const previews = useMemo(() => [...files, ...videos].map((file) => ({ file, url: URL.createObjectURL(file) })), [files, videos]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  const set = <K extends keyof PublicListingDraftFields>(key: K, value: PublicListingDraftFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  const addressLine = useMemo(
    () => [fields.street, fields.houseNumber].filter(Boolean).join(' ') || fields.address,
    [fields.street, fields.houseNumber, fields.address],
  );
  useEffect(() => {
    if (fields.city.trim() && addressLine.trim()) setAddressResolved(true);
    if (!fields.city && !addressLine) setAddressResolved(false);
  }, [fields.city, addressLine]);
  // Confirmation follows the same image order that publication persists.
  const primaryPhoto = fields.importedListing?.photos?.find((url: unknown) => typeof url === 'string' && url.startsWith('https://')) || previews.find(({ file }) => file.type.startsWith('image/'))?.url;

  const publish = async (draftFields = fields, draftFiles = files, draftVideos = videos) => {
    if (!user?.id || publishing) return;
    if (!draftFields.city.trim() || !(draftFields.street.trim() || draftFields.address.trim()) || !draftFields.propertyType.trim() || !draftFields.price) {
      return;
    }
    setPublishing(true);
    setPublishError('');
    try {
      setPublishStage('השלמת הרשאת מפרסם');
      // The account type follows what the poster picked: מתווך → broker, פרטי → private owner.
       if (draftFields.publisherType === 'broker' && !isBroker) {
        const { error } = await supabase.rpc('register_as_broker', { _display_name: draftFields.contactName.trim() || null });
        if (error) throw error;
        await refetchRoles();
       } else if (draftFields.publisherType === 'private' && !isPropertyOwner) {
        const { error } = await supabase.rpc('register_as_property_owner', { _display_name: draftFields.contactName.trim() || null });
        if (error) throw error;
        await refetchRoles();
      }
      const source = draftFields.importedListing || imported;
       const photos: string[] = [];
       for (const url of Array.isArray(source?.photos) ? source.photos : []) {
         if (typeof url !== 'string' || !url.startsWith('https://')) continue;
         setPublishStage('שמירת תמונות המודעה');
          if (draftFields.listingId) { photos.push(url); continue; }
           const { data: mirrored, error: mirrorError } = await supabase.functions.invoke('mirror-external-image', { body: { url, source: 'yad2' } });
         if (mirrorError || !mirrored?.public_url) throw new Error('לא ניתן לשמור את תמונות המודעה מיד2. הטיוטה נשמרה.');
         photos.push(mirrored.public_url);
       }
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
      const payload = {
         user_id: user.id, workspace_owner_id: activeWorkspaceId || user.id, owner_id: user.id,
        slug: slugFor(user.id), property_title: title, description: draftFields.description.trim() || title, asking_price: toNum(draftFields.price) ?? 0,
        city: draftFields.city.trim(), neighborhood: draftFields.neighborhood.trim() || null, address,
        house_number: draftFields.houseNumber.trim() || null,
        apartment_number: draftFields.apartmentNumber.trim() || null,
         deal_type: draftFields.dealType, rooms: toNum(draftFields.rooms),
        sqm: toNum(draftFields.sqm) ?? toNum(draftFields.builtSqm),
         floor: draftFields.floor === 'קרקע' ? 0 : toInt(draftFields.floor),
         source_url: source?.source_url || null,
         source_metadata: source?.source_metadata || {},
         additional_details: source || {},
         features: {
           ...(source ? { source_details: source } : {}),
          property_type: draftFields.propertyType.trim(),
          publisher_type: draftFields.publisherType,
          street: street || null,
           media_videos: Array.from(new Set([...(Array.isArray(source?.features?.media_videos) ? source.features.media_videos : []), ...importedVideoUrls(source), ...clips])),
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
          contact_whatsapp: normalizeIlPhone(draftFields.contactWhatsapp) || null,
          contact_email: draftFields.contactEmail?.trim() || null,
        },
        media_photos: photos, image_url: photos[0] ?? null,
         status: 'live', source: draftFields.listingId ? source?.source || 'manual' : source ? 'yad2' : 'manual', is_published: true, affiliate_enabled: true,
      };
      const commissions: Record<string, unknown> = {};
      const cf = toNum(draftFields.commissionForm), cw = toNum(draftFields.commissionWhatsapp), cp = toNum(draftFields.commissionPhone);
      if (cf != null) commissions.affiliate_tier1_amount = cf;
      if (cw != null) commissions.affiliate_tier2_amount = cw;
      if (cp != null) commissions.affiliate_tier3_amount = cp;
      const limits = { form: toInt(draftFields.limitForm), whatsapp: toInt(draftFields.limitWhatsapp), phone: toInt(draftFields.limitPhone) };
      const limitValues = Object.values(limits).filter((v): v is number => v != null);
      if (limitValues.length) commissions.daily_lead_cap = limitValues.reduce((a, b) => a + b, 0);
      Object.assign(payload, commissions);
      (payload.features as Record<string, unknown>).lead_daily_limits = limits;
      (payload.features as Record<string, unknown>).commission_terms_accepted_at = new Date().toISOString();
      let request;
      if (draftFields.listingId && activeWorkspaceId) {
        const { data: existing, error: readError } = await supabase.from('listings').select('features, source_metadata, additional_details').eq('id', draftFields.listingId).eq('workspace_owner_id', activeWorkspaceId).single();
        if (readError) throw readError;
        const { slug, user_id, owner_id, workspace_owner_id, affiliate_enabled, ...updates } = payload;
        request = supabase.from('listings').update({ ...updates, features: { ...(existing.features as object || {}), ...payload.features }, source_metadata: { ...(existing.source_metadata as object || {}), publication_error: null }, additional_details: existing.additional_details } as never).eq('id', draftFields.listingId).eq('workspace_owner_id', activeWorkspaceId);
      } else request = supabase.from('listings').insert(payload as never);
      const { data, error } = await request.select('id').single();
      if (error) throw error;
      await clearPublicListingDraft(draftScope).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['my-ad-recovery'] });
      onRecovered?.();
      void queryClient.invalidateQueries({ queryKey: ['owner-listings'] });
       void queryClient.invalidateQueries({ queryKey: ['my-ads-stats'] });
      toast.success('הנכס פורסם בלוח השיתופי');
       celebratePublication(publicationAudio.current);
       publicationAudio.current = null;
       initializedPublisher.current = '';
        setConfirming(false); setOpen(false); setFields(EMPTY_PUBLIC_LISTING_DRAFT); setFiles([]); setVideos([]); setStep(0); setImportSlide(false); setImported(null); setImportUrl(''); setReviewMode(false);
      const publishedListingId = (data as { id?: string } | null)?.id;
      // Rita welcome WhatsApp for first-time posters (once per user, best-effort).
      try {
        const welcomeKey = `rita-welcome-sent:${user.id}`;
        const phone = (draftFields.contactWhatsapp || user.phone || '').replace(/\D/g, '');
        if (phone.length >= 9 && !localStorage.getItem(welcomeKey)) {
          localStorage.setItem(welcomeKey, '1');
          const name = draftFields.contactName.trim() || 'שלום';
          const address = [street, draftFields.city].filter(Boolean).join(', ');
          const message = `היי ${name}, ברוכים הבאים ל-Realtyz!\n\nהנכס שלך${address ? ` ב${address}` : ''} פורסם וכבר מופיע בלוח הנדל״ן השיתופי.\n\nסטטוס פרסום ראשוני:\n• לוח שיתופי: פעיל\n• שותפים: הנכס פתוח לקידום על ידי שותפים\n• הפצה לקבוצות: ממתין לתור ההפצה לאחר חיבור קבוצות הפייסבוק בחשבון\n\nלכל שאלה אפשר לענות כאן. ריטה, Realtyz`;
          void supabase.functions.invoke('send-whatsapp', { body: { phone_number: phone, message, listing_id: publishedListingId } })
            .then(({ error: waErr }) => { if (waErr) console.warn('welcome whatsapp failed', waErr); });
        }
      } catch { /* never block posting */ }
      // First-time posters land inside their own signed-in workspace with the
      // full app shell, instead of staying on the public board.
      const targetWorkspace = activeWorkspaceId || user.id;
      try {
        await refreshWorkspaces();
        await setActiveWorkspace(targetWorkspace);
      } catch { /* workspace switch is best-effort; navigation still proceeds */ }
      navigate(draftFields.publisherType === 'private' ? '/my-ads' : '/dashboard', { replace: true, state: { publishedListingId } });
    } catch (error) {
       void publicationAudio.current?.close().catch(() => {});
       publicationAudio.current = null;
      const e = error as { message?: string; details?: string; hint?: string } | null;
      const message = (error instanceof Error ? error.message : [e?.message, e?.details, e?.hint].filter(Boolean).join(' · ')) || 'שגיאה לא ידועה';
      console.error('public listing publish failed', error);
       const friendly = message.includes('row-level security') || message.includes('permission')
          ? `אין הרשאה לפרסם את הנכס בחשבון הזה (${message})`
          : message;
      const detailedError = `${publishStage || 'פרסום'}: ${friendly}`;
      setPublishError(detailedError);
      await saveDraft({ ...draftFields, publicationError: detailedError }, draftFiles, draftVideos).catch(() => {});
      toast.error('פרסום הנכס נכשל והטיוטה נשמרה', { description: detailedError });
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (!autoResume || !user?.id || resumed) return;
    setResumed(true);
    void readPublicListingDraft('visitor').then((draft) => {
      if (!draft) return;
      setFields(draft); setFiles(draft.files ?? []); setVideos(draft.videos ?? []);
      setReviewMode(true); setExpandedStep(`step-${draft.resumeStep || 0}`); setOpen(true);
    });
  }, [autoResume, user?.id, resumed]);

  const stepValid = () => {
    if (step === 2) return Boolean(fields.propertyType);
    if (step === 3) return Boolean(fields.city.trim() && (fields.street.trim() || fields.address.trim()) && fields.floor && fields.totalFloors);
    if (step === 4) return Boolean(fields.rooms && fields.condition && fields.airDirections);
    if (step === 5) return Boolean(fields.price && (fields.sqm || fields.builtSqm));
    if (step === 8) return Boolean(fields.commissionTermsAccepted);
    return true;
  };
  const goNext = async () => {
    if (!stepValid()) { toast.error('יש להשלים את שדות החובה לפני המעבר'); return; }
    try { await saveDraft(); } catch { /* draft saving is best-effort */ }
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const pickAndAdvance = async <K extends 'publisherType' | 'dealType' | 'propertyType'>(key: K, value: PublicListingDraftFields[K]) => {
    const nextFields = { ...fields, [key]: value };
    setFields(nextFields);
    try { await saveDraft(nextFields); } catch { /* best effort */ }
    if (reviewMode) return;
    if (key === 'publisherType') { setImportSlide(true); return; }
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
    const missing = missingAdFields(fields);
    if (missing.length) { toast.error(`יש להשלים: ${missing.join(' · ')}`); return; }
    if (!fields.city.trim() || !(fields.street.trim() || fields.address.trim()) || !fields.propertyType.trim() || !fields.price) {
      return;
    }
    if (!fields.contactName.trim() || fields.contactWhatsapp.replace(/\D/g, '').length < 9) {
      toast.error('יש למלא שם ומספר ווטסאפ'); return;
    }
    if (!fields.termsAccepted) { toast.error('יש לאשר את התקנון'); return; }
    if (!fields.commissionTermsAccepted) { toast.error('יש לאשר שקראת והבנת את מנגנון העמלות'); return; }
    if (!confirming) { setConfirming(true); return; }
    if (user) publicationAudio.current = preparePublicationSound();
    try {
      await saveDraft();
      if (!user) { setPendingSignupRole('property_owner'); navigate('/auth'); return; }
      await publish();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'שגיאת אחסון בדפדפן';
      setPublishError(`שמירת הטיוטה: ${reason}`);
      toast.error('לא ניתן לשמור את הטיוטה בדפדפן', { description: reason });
    }
  };

  const isLast = step === STEP_TITLES.length - 1;

  // Imported Yad2 ads are kept in the active workspace inventory so brokers never lose them.
  const saveToMyProperties = async (row: Record<string, any>, knownId: string | null = null) => {
    if (!activeWorkspaceId) { setMyPropsSave('error'); return; }
    setMyPropsSave('saving');
    try {
      const findId = async () => {
        if (row.external_id) {
          const { data } = await supabase.from('listings').select('id').eq('source', 'yad2').eq('external_id', String(row.external_id)).eq('workspace_owner_id', activeWorkspaceId).limit(1);
          if (data?.[0]?.id) return data[0].id as string;
        }
        if (row.source_url) {
          const { data } = await supabase.from('listings').select('id').eq('source_url', String(row.source_url)).eq('workspace_owner_id', activeWorkspaceId).limit(1);
          if (data?.[0]?.id) return data[0].id as string;
        }
        return null;
      };
      let id = knownId ?? await findId();
      if (!id && row.source_url) {
        await supabase.functions.invoke('yad2-unlocker', { body: { url: row.source_url, limit: 1, pages: 1, import_item: true } });
        id = await findId();
      }
      if (!id) throw new Error('not_saved');
      setMyPropsSave('saved');
      queryClient.invalidateQueries({ queryKey: ['properties-search'] });
      toast.success('הנכס נשמר בנכסים שלי');
    } catch {
      setMyPropsSave('error');
    }
  };

  const importYad2 = async (value = importUrl) => {
    if (importInFlight.current) return;
    if (!user) { navigate('/auth'); return; }
    let url: URL;
    // Accept any Yad2 link: standard ads, regional paths, short (/s/...) and share links, any subdomain.
    const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/\S*/i)?.[0] ?? value.trim();
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { setPublishError('יש להדביק קישור תקין ליד2, או להמשיך ללא ייבוא'); return; }
    if (!/(^|\.)yad2\.co\.il$/i.test(url.hostname)) { setPublishError('יש להדביק קישור מיד2, או להמשיך ללא ייבוא'); return; }
    url.protocol = 'https:';
    const isItem = /\/realestate\/item\//i.test(url.pathname);
    const sourceUrl = isItem ? `${url.origin}${url.pathname}` : url.toString();
    importInFlight.current = true;
    setImporting(true); setPublishError(''); setImportStage('בודק מודעה שמורה או מייבא פרטים מיד2…');
    try {
      const token = url.pathname.match(/\/realestate\/item\/(?:[a-z0-9-]+\/)?([a-z0-9]+)(?=[\/?#]|$)/i)?.[1] ?? null;
      const target = token ? `https://www.yad2.co.il/realestate/item/${token}` : sourceUrl;
      const saved = await readRecentYad2Listing(token, activeWorkspaceId);
      const { data: u, error } = saved ? { data: saved, error: null } : await supabase.functions.invoke('yad2-unlocker', { body: { url: target, limit: 1, pages: 1, import_item: true } });
      if (error || u?.error) {
        const response = (error as { context?: Response } | null)?.context;
        const details = response ? await response.clone().json().catch(() => null) : null;
        throw new Error(details?.detail || u?.detail || 'לא ניתן לטעון את המודעה כרגע. אפשר להמשיך ולמלא ידנית.');
      }
      const row = (Array.isArray(u?.results) ? u.results : []).find((r: any) => !token || String(r.external_id ?? '').toLowerCase() === token.toLowerCase());
      if (!row) throw new Error('לא התקבלו פרטים למודעה הזאת. אפשר להמשיך ידנית.');
      const attrs = row.attributes ?? {};
      const d = { ...row,
        address: [row.address, row.house_number].filter(Boolean).join(' '),
        total_floors: attrs.total_floors ?? attrs.totalFloors,
        description: row.long_description || row.description || row.short_description,
        listing_type: row.deal_type,
        property_type: attrs.property_type ?? row.property_type,
        elevator: attrs.elevator, parking: attrs.parking,
      };
      setImportStage(u.served_from === 'pool_stale' || u.served_from === 'item_cache_stale' ? 'מוצגים הפרטים האחרונים שנשמרו. רענון נוסף יהיה זמין בתום 24 שעות.' : u.cached ? 'המודעה נטענה מהמאגר השמור' : 'פרטי המודעה נשמרו');
      const types: Record<string, string> = { apartment: 'דירה', garden_apartment: 'דירת גן', penthouse: 'פנטהאוז', duplex: 'דופלקס', private_house: 'בית פרטי', cottage: 'בית פרטי', studio: 'סטודיו', commercial: 'משרד', land: 'מגרש', loft: 'דירה', other: 'דירה' };
      const src = d;
      setImported({ ...src, source_url: sourceUrl }); setImportSlide(false);
      const addr = String(src.address || '').trim();
      const m = addr.match(/^(.*?)[\s,]+(\d+[א-ת]?)\s*$/);
      const street = m ? m[1].trim() : addr;
      const houseNumber = m ? m[2] : '';
      const str = (v: unknown) => (v == null || v === '' ? '' : String(v));
      const next: PublicListingDraftFields = { ...fields, importedListing: { ...src, source_url: sourceUrl }, city: src.city || fields.city, address: addr || fields.address, street: street || fields.street, houseNumber: houseNumber || fields.houseNumber, neighborhood: src.neighborhood || fields.neighborhood, price: str(src.price) || fields.price, propertyType: types[src.property_type] || src.property_type || fields.propertyType || '', dealType: src.listing_type === 'rent' ? 'rent' : 'sale', rooms: str(src.rooms) || fields.rooms, sqm: str(src.sqm) || fields.sqm, floor: str(src.floor) || fields.floor, totalFloors: str(src.total_floors) || fields.totalFloors, description: src.description || fields.description, elevator: Boolean(src.elevator), parking: Number(src.parking) > 0, contactWhatsapp: str(src.owner_phone) || fields.contactWhatsapp, contactName: str(src.owner_name) || fields.contactName || user.user_metadata?.full_name || '' };
      if (isBroker) { next.publisherType = 'broker'; next.contactName = fields.contactName || publisherName; next.contactWhatsapp = fields.contactWhatsapp || publisherPhone; }
      setFields(next);
      setStep(0);
      setReviewMode(true); setExpandedStep(isBroker ? 'step-1' : 'step-0');
      try { await saveDraft(next); } catch { /* best effort */ }
      void saveToMyProperties({ ...src, source_url: sourceUrl }, u?.listing_id ?? null);
    } catch (e) { setPublishError(e instanceof Error ? e.message : 'לא ניתן לייבא את המודעה'); }
    finally { importInFlight.current = false; setImporting(false); }
  };

  useEffect(() => {
    if (!open || !importSlide || importing) return;
    const value = importUrl.trim();
    if (!/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/(?:realestate\/item\/\S+|s\/\S+|share\/\S+)/i.test(value)) return;
    if (lastAutoImport.current === value) return;
    const timer = window.setTimeout(() => {
      lastAutoImport.current = value;
      void importYad2(value);
    }, 180);
    return () => window.clearTimeout(timer);
    // Import callbacks read the current draft when a new URL is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importUrl, open, importSlide, importing]);

  const stepFilled = (i: number): boolean => {
    const f = fields;
    const photos = Array.isArray((f.importedListing as any)?.photos) ? (f.importedListing as any).photos.length : 0;
    switch (i) {
      case 0: return Boolean(f.publisherType);
      case 1: return Boolean(f.dealType);
      case 2: return Boolean(f.propertyType);
      case 3: return Boolean(f.city.trim() && (f.street.trim() || f.address.trim()) && f.floor && f.totalFloors);
      case 4: return Boolean(f.rooms && f.condition && f.airDirections);
      case 5: return Boolean(f.price && (f.sqm || f.builtSqm));
      case 6: return photos > 0 || files.length > 0 || videos.length > 0;
      case 7: return Boolean(f.contactName?.trim() && f.contactWhatsapp.replace(/\D/g, '').length >= 9);
      case 8: return Boolean(f.commissionTermsAccepted);
      default: return false;
    }
  };

  // The publish button stays disabled until every mandatory detail is complete.
  const hasMedia = (Array.isArray((fields.importedListing as any)?.photos) ? (fields.importedListing as any).photos.length : 0) > 0 || importedVideoUrls(fields.importedListing).length > 0 || files.length > 0 || videos.length > 0;
  const missingPublish = useMemo(() => missingPublishFields(fields, hasMedia), [fields, hasMedia]);
  const canPublish = missingPublish.length === 0;

  const renderStep = (step: number) => (
    <>
          {step === 0 && !importSlide && (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={fields.publisherType === 'broker' ? 'default' : 'outline'} className="h-auto p-6 text-base font-bold" onClick={() => void pickAndAdvance('publisherType', 'broker')}>מתווך</Button>
              <Button type="button" variant={fields.publisherType === 'private' ? 'default' : 'outline'} className="h-auto p-6 text-base font-bold" onClick={() => void pickAndAdvance('publisherType', 'private')}>פרטי</Button>
            </div>
          )}
          {step === 0 && importSlide && (
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="yad2-import-url">ייבוא מודעה מיד2 (אופציונלי)</Label><div className="flex gap-2"><Input id="yad2-import-url" dir="ltr" type="url" value={importUrl} onChange={e => setImportUrl(e.target.value)} onFocus={e => e.currentTarget.select()} onPaste={e => { e.preventDefault(); const pasted = e.clipboardData.getData('text').trim(); const clean = pasted.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0] ?? pasted; setImportUrl(clean); setPublishError(''); if (/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/\S+/i.test(clean)) { lastAutoImport.current = clean; void importYad2(clean); } }} placeholder="https://www.yad2.co.il/realestate/item/..." className="placeholder:text-muted-foreground/70" /><Button type="button" disabled={importing || !importUrl.trim()} onClick={() => { lastAutoImport.current = importUrl.trim(); void importYad2(); }}>{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ייבוא מודעה'}</Button></div></div>
              {importing && <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />{importStage}</div>}
              <Button type="button" variant="outline" className="w-full" onClick={() => { setPublishError(''); setImportSlide(false); setStep(1); setReviewMode(true); setExpandedStep('step-1'); }}>המשך ללא ייבוא <ArrowLeft className="h-4 w-4" /></Button>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {([['rent', 'השכרה'], ['sale', 'מכירה']] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={fields.dealType === value ? 'default' : 'outline'}
                  onClick={() => void pickAndAdvance('dealType', value)}
                  className={cn(
                    'h-auto px-2 py-[7px] text-center text-base font-bold leading-none hover:bg-transparent hover:text-inherit',
                    fields.dealType === value && (value === 'rent'
                      ? 'border-sale bg-sale text-sale-foreground hover:bg-sale hover:text-sale-foreground'
                      : 'border-success bg-success text-success-foreground hover:bg-success hover:text-success-foreground'),
                  )}
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
                onPick={(place) => { setAddressResolved(true); setFields((current) => ({
                  ...current,
                   street: place.street,
                   houseNumber: place.house_number,
                   neighborhood: place.neighborhood,
                   city: place.city,
                   area: place.area,
                   address: place.formatted_address,
                })); }}
              />
              {addressResolved && <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)] gap-2">
                <div className="min-w-0"><Label htmlFor="wizard-city">עיר *</Label><Input id="wizard-city" className="min-w-0 px-2 text-base" value={fields.city} onChange={(e) => set('city', e.target.value)} /></div>
                <div className="min-w-0"><Label htmlFor="wizard-street">רחוב *</Label><Input id="wizard-street" className="min-w-0 px-2 text-base" value={fields.street} onChange={(e) => set('street', e.target.value)} /></div>
                <div className="min-w-0"><Label htmlFor="wizard-house">מספר בית</Label><Input id="wizard-house" className="min-w-0 px-2 text-base" inputMode="text" value={fields.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} /></div>
              </div>}
              {addressResolved && <div className="grid grid-cols-2 gap-3">
                {fields.neighborhood && <div><Label>שכונה</Label><Input value={fields.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>}
                {fields.area && <div><Label>אזור</Label><Input value={fields.area} onChange={(e) => set('area', e.target.value)} /></div>}
              </div>}
              <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor="wizard-floor">קומה *</Label><Select value={fields.floor} onValueChange={(value) => set('floor', value)}><SelectTrigger id="wizard-floor"><SelectValue placeholder="קומה" /></SelectTrigger><SelectContent>{FLOOR_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option === 'קרקע' ? option : `קומה ${option}`}</SelectItem>)}</SelectContent></Select></div>
                <div><Label htmlFor="wizard-total-floors">מתוך *</Label><Select value={fields.totalFloors} onValueChange={(value) => set('totalFloors', value)}><SelectTrigger id="wizard-total-floors"><SelectValue placeholder="מתוך" /></SelectTrigger><SelectContent>{TOTAL_FLOOR_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option} קומות</SelectItem>)}</SelectContent></Select></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div><Label htmlFor="wizard-rooms"></Label><Select value={fields.rooms} onValueChange={(value) => set('rooms', value)}><SelectTrigger id="wizard-rooms"><SelectValue placeholder="חדרים" /></SelectTrigger><SelectContent>{ROOM_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option} חדרים</SelectItem>)}</SelectContent></Select></div>
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
              <div><Label>מ״ר בנוי</Label><Input inputMode="decimal" value={fields.builtSqm} onChange={(e) => set('builtSqm', decimalInput(e.target.value))} /></div>
              <div><Label>מ״ר גינה</Label><Input inputMode="numeric" value={fields.gardenSqm} onChange={(e) => set('gardenSqm', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>גודל במ״ר סך הכל</Label><Input inputMode="decimal" value={fields.sqm} onChange={(e) => set('sqm', decimalInput(e.target.value))} /></div>
              <div><Label>{fields.dealType === 'rent' ? 'שכירות חודשית *' : 'מחיר מכירה *'}</Label><Input inputMode="numeric" value={fields.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} /></div>
              <div><Label>תאריך כניסה</Label><Input type="date" value={fields.entryDate} onChange={(e) => set('entryDate', e.target.value)} /></div>
            </div>
          )}

          {step === 6 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(() => { const items = [...(Array.isArray(fields.importedListing?.photos) ? fields.importedListing.photos.filter((s: string) => !isVideoUrl(s)) : []).map((s: string) => ({ s, v: false })), ...importedVideoUrls(fields.importedListing).map((s) => ({ s, v: true }))]; return items.length > 0 && <div className="sm:col-span-2 flex gap-2 overflow-x-auto">{items.map(({ s, v }) => v ? <video key={s} src={s} controls playsInline preload="metadata" className="h-24 w-32 shrink-0 rounded-md bg-muted object-cover" /> : <img key={s} src={s} alt="תמונת הנכס" className="h-24 w-32 shrink-0 rounded-md object-cover" />)}</div>; })()}
              <div className="sm:col-span-2">
                <Label htmlFor="wizard-media" className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                  <span className="flex items-center gap-2"><ImagePlus className="h-6 w-6" /><Film className="h-6 w-6" /></span>
                  {files.length || videos.length ? `${files.length} תמונות · ${videos.length} סרטונים נבחרו` : 'לחיצה או גרירה להעלאת תמונות וסרטונים'}
                </Label>
                <input
                  id="wizard-media" type="file" accept="image/*,video/*" multiple className="sr-only"
                  onChange={(e) => { const all = Array.from(e.target.files ?? []); const imgs = all.filter(f => f.type.startsWith('image/')); const vids = all.filter(f => f.type.startsWith('video/')); if (imgs.length) addMedia(imgs, 'image'); if (vids.length) addMedia(vids, 'video'); if (all.length > imgs.length + vids.length) toast.error('ניתן להעלות תמונות או סרטונים בלבד'); e.target.value = ''; }}
                />
              </div>
               {previews.length > 0 && <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{previews.map(({ file, url }) => <div key={`${file.name}-${file.size}-${file.lastModified}`} className="relative aspect-video overflow-hidden rounded-md border bg-muted">{file.type.startsWith('video/') ? <video src={url} controls className="h-full w-full object-cover" /> : <img src={url} alt={file.name} className="h-full w-full object-cover" />}<Button type="button" size="icon" variant="secondary" className="absolute end-1 top-1 h-7 w-7" aria-label={`הסרת ${file.name}`} onClick={() => { setFiles((current) => current.filter((item) => item !== file)); setVideos((current) => current.filter((item) => item !== file)); }}><X className="h-4 w-4" /></Button></div>)}</div>}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
               <div><Label htmlFor="publisher-name">השם שלך *</Label><Input id="publisher-name" placeholder={publisherName} value={fields.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
                <div><Label htmlFor="publisher-whatsapp">מספר ווטסאפ *</Label><Input id="publisher-whatsapp" inputMode="tel" dir="ltr" placeholder="050-1234567" className="text-right" value={formatIlPhone(fields.contactWhatsapp)} onChange={(e) => set('contactWhatsapp', formatIlPhone(e.target.value))} /></div>
                <div><Label htmlFor="publisher-email">אימייל</Label><Input id="publisher-email" type="email" dir="ltr" value={fields.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={fields.marketingAccepted} onCheckedChange={(checked) => set('marketingAccepted', Boolean(checked))} />
                 אני רוצה לקבל פניות ועדכונים שיווקיים
              </label>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-3">
              <p className="text-sm font-bold">עמלה ומגבלה יומית לכל סוג פנייה</p>
              <div className="grid grid-cols-[1fr_6rem_6rem] items-end gap-2 text-sm">
                <span className="text-xs text-muted-foreground">סוג פנייה</span>
                <span className="text-xs text-muted-foreground">עמלה (₪)</span>
                <span className="text-xs text-muted-foreground">מקס׳ ביום</span>
                {LEAD_TYPES.map(({ key, label }) => (
                  <div key={key} className="contents">
                    <span className="flex items-center gap-1 self-center font-medium">
                      {label}
                      <LeadTypeHelp label={label}>
                        <p>
                          {key === 'Form' && 'איש הקשר ממלא את טופס המודעה ועונה על 3 שאלות הסינון שהגדרת; התשובות נשמרות יחד עם פרטי הפנייה.'}
                          {key === 'Whatsapp' && 'איש הקשר פותח שיחת ווטסאפ וריטה שואלת את 3 שאלות הסינון שהגדרת; התמליל המלא של השיחה נשמר לצפייה.'}
                          {key === 'Phone' && 'איש הקשר מתקשר למספר שבמודעה; השיחה מוקלטת ומתומללת, וכוללת את 3 שאלות הסינון שהגדרת.'}
                        </p>
                        {LEAD_TYPE_VALIDITY}
                      </LeadTypeHelp>
                    </span>
                    <Input inputMode="decimal" aria-label={`עמלה עבור ${label}`} value={(fields as any)[`commission${key}`] || ''} onChange={(e) => set(`commission${key}` as any, decimalInput(e.target.value) as never)} />
                    <Input inputMode="numeric" aria-label={`מגבלה יומית עבור ${label}`} value={(fields as any)[`limit${key}`] || ''} onChange={(e) => set(`limit${key}` as any, e.target.value.replace(/\D/g, '') as never)} />
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Checkbox id="commission-terms" checked={Boolean(fields.commissionTermsAccepted)} onCheckedChange={(checked) => set('commissionTermsAccepted', Boolean(checked))} />
                <span><label htmlFor="commission-terms">קראתי והבנתי את </label>
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="font-semibold text-primary underline underline-offset-2">מנגנון העמלות</button>
                  </DialogTrigger>
                  <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader><DialogTitle className="text-right">איך עובד מנגנון העמלות</DialogTitle></DialogHeader>
                    <div className="space-y-3 text-sm leading-relaxed">
                      <p>שותפים ומשווקים ברשת מפיצים את המודעה שלך. כשאיש קשר חדש פונה אליך דרכם, נרשמת פנייה ואתה משלם את העמלה שהגדרת לאותו סוג פנייה.</p>
                      <ul className="list-disc space-y-1 ps-5">
                        <li><b>פנייה בטופס:</b> איש הקשר השאיר פרטים בטופס המודעה.</li>
                        <li><b>שיחה עם ריטה בווטסאפ:</b> איש הקשר פתח שיחה בווטסאפ וקיבל מענה ממערכת ריטה.</li>
                        <li><b>שיחת טלפון:</b> איש הקשר התקשר ישירות למספר שבמודעה.</li>
                      </ul>
                      <p><b>מגבלה יומית:</b> מספר הפניות המרבי שתחויב עליהן ביום מכל סוג. לאחר שהגעת למגבלה, המודעה ממשיכה להופיע אך לא תחויב על פניות נוספות מאותו סוג עד היום הבא.</p>
                      <p>כל פנייה נבדקת באמצעות 3 שאלות סינון קצרות שהמפרסם קובע מראש, וכוללת תמליל מלא של השיחה (ובשיחות טלפון גם הקלטה). פנייה נחשבת תקפה וחייבת לחיוב רק אם התשובות חיוביות ומשביעות רצון.</p>
                      <p>עמלה גבוהה יותר מעודדת שותפים לקדם את המודעה שלך. ניתן לשנות את הסכומים והמגבלות בכל עת מתוך המודעות שלי. שדה ריק משאיר את ההגדרה הקיימת או ללא עמלה.</p>
                      <p>החיוב מתבצע רק על פנייה אמיתית שנרשמה במערכת, ולא על צפיות או קליקים.</p>
                    </div>
                  </DialogContent>
                </Dialog></span>
              </div>
            </div>
          )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !publishing) void saveDraft().then(() => onRecovered?.()).catch(() => {}); setOpen(value); }}>
      {!resumeDraft && <DialogTrigger asChild>
        <Button disabled={disabled} className="h-9 whitespace-nowrap text-[15px] sm:text-[19px] font-bold leading-none bg-success text-success-foreground hover:bg-success/90">פרסום חינם</Button>
      </DialogTrigger>}
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>
             {reviewMode ? 'פרטי המודעה' : step === 0 && importSlide ? 'ייבוא מודעה מיד 2' : step > 0 ? `${step} / 8 · ${STEP_TITLES[step]}` : STEP_TITLES[step]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {publishError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-bold">הפרסום לא הושלם</p><p className="mt-1 break-words text-xs">{publishError}</p></div>}
          {reviewMode ? (
            <Accordion type="single" collapsible value={expandedStep} onValueChange={setExpandedStep} className="space-y-2">
               {STEP_TITLES.map((title, i) => i === 0 ? null : (
                <AccordionItem key={title} value={`step-${i}`} className="rounded-md border bg-background">
                  <AccordionTrigger className="gap-3 px-4 text-start hover:no-underline">
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${stepFilled(i) ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`} aria-label={`שלב ${i} מתוך 8`}>{i}</span>
                      <span className="min-w-0 flex-1">{title}</span>
                      <span className={`shrink-0 text-xs ${stepFilled(i) ? 'text-success' : 'text-muted-foreground'}`}>{stepFilled(i) ? 'הושלם' : 'חסרים פרטים'}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4">{renderStep(i)}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : renderStep(step)}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
            {!reviewMode && (step > 0 || (importSlide && !isBroker)) ? <Button type="button" variant="outline" onClick={() => { if (step === 0) setImportSlide(false); else { setStep((current) => Math.max(0, current - 1)); if (isBroker && step === 1) setImportSlide(true); } }}>
            <ArrowRight className="h-4 w-4" /> חזרה
           </Button> : <span />}
          {reviewMode || isLast ? (
            <div className="flex items-center justify-end gap-3">
              {!canPublish && <span className="hidden text-xs text-muted-foreground sm:inline" title={missingPublish.join(' · ')}>חסר: {missingPublish[0]}{missingPublish.length > 1 ? ` +${missingPublish.length - 1}` : ''}</span>}
              <label className="flex max-w-sm items-start gap-2 text-xs leading-snug">
                <Checkbox checked={fields.termsAccepted} onCheckedChange={(checked) => set('termsAccepted', Boolean(checked))} className="mt-0.5" />
                <span>אני מאשר/ת את <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">התקנון</a> ואת <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">מדיניות הפרטיות</a> ומצהיר/ה שיש לי הרשאה לפרסם את הנכס והתמונות</span>
              </label>
              <Button type="button" disabled={publishing || !canPublish} title={canPublish ? undefined : `עדיין חסרים: ${missingPublish.join(' · ')}`} onClick={() => void submit()} className="shrink-0 bg-success text-success-foreground hover:bg-success/90">
                {publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> מפרסם…</> : user ? 'פרסום הנכס' : 'הרשמה ופרסום'}
              </Button>
            </div>
          ) : !reviewMode && step > 1 ? (
            <Button type="button" onClick={() => void goNext()}>לשלב הבא <ArrowLeft className="h-4 w-4" /></Button>
          ) : <span />}
        </div>
      </DialogContent>
      <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle className="text-right">אישור פרסום הנכס</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {primaryPhoto && <img src={primaryPhoto} alt="תמונת הנכס הראשית" className="aspect-video w-full rounded-md object-cover" />}
          <p className="text-xs font-semibold text-muted-foreground">{fields.dealType === 'rent' ? 'להשכרה' : 'למכירה'} · {fields.propertyType}</p>
          <p className="break-words text-lg font-bold">{[addressLine, fields.city].filter(Boolean).join(', ')}</p>
          {fields.neighborhood && <p className="text-sm text-muted-foreground">{fields.neighborhood}</p>}
          <p className="text-2xl font-bold text-primary">₪{Number(fields.price || 0).toLocaleString('he-IL')}</p>
          <dl className="grid grid-cols-3 gap-2 border-y border-border py-3 text-center text-sm">
            {fields.rooms && <div><dt className="text-xs text-muted-foreground">חדרים</dt><dd className="mt-1 font-semibold">{fields.rooms}</dd></div>}
            {fields.floor && <div><dt className="text-xs text-muted-foreground">קומה</dt><dd className="mt-1 font-semibold">{fields.floor}{fields.totalFloors ? ` מתוך ${fields.totalFloors}` : ''}</dd></div>}
            {(fields.sqm || fields.builtSqm) && <div><dt className="text-xs text-muted-foreground">שטח</dt><dd className="mt-1 font-semibold">{fields.sqm || fields.builtSqm} מ״ר</dd></div>}
          </dl>
        </div>
        <div className="flex justify-between gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>חזרה לעריכה</Button><Button className="bg-success text-success-foreground hover:bg-success/90" disabled={publishing || !canPublish} title={canPublish ? undefined : `עדיין חסרים: ${missingPublish.join(' · ')}`} onClick={() => void submit()}>{publishing ? 'מפרסם…' : 'אישור ופרסום'}</Button></div>
      </DialogContent></Dialog>
    </Dialog>
  );
}

const toNum = (raw: unknown): number | null => {
  const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return String(raw ?? '').trim() && Number.isFinite(n) ? n : null;
};
const decimalInput = (v: string) => { const c = v.replace(/[^\d.]/g, ''); const [a, ...rest] = c.split('.'); return rest.length ? `${a}.${rest.join('').slice(0, 2)}` : a; };
const toInt = (raw: unknown): number | null => { const n = toNum(raw); return n == null ? null : Math.round(n); };

export default PublicListingPublisher;
