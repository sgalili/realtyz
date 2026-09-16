/**
 * ScheduledToursCard
 * ------------------
 * Upcoming property tours booked from public property landing pages.
 * Two views: list ("רשימה") and month calendar ("לוח שנה"), both exposing the
 * same details and the same communication actions per scheduled task.
 *
 * Outbound WhatsApp always goes through the official Meta WBA gateway
 * (see src/lib/officialWa.ts) — never a personal or Green API number.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CalendarClock,
  Check,
  X,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Pencil,
  StickyNote,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { BrandIcon } from '@/components/BrandIcon';
import { DigitalSignatureButton } from '@/components/signature/DigitalSignatureButton';
import { NewTourDialog, type EditableTour } from '@/components/dashboard/NewTourDialog';
import { SignatureStatusStrip } from '@/components/signature/SignatureStatusStrip';
import {
  ScheduleMonthGrid,
  ScheduleViewToggle,
  startOfThisMonth,
  todayKey,
  type ScheduleView,
} from '@/components/dashboard/ScheduleViews';

type Tour = {
  id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  scheduled_at: string;
  property_title: string | null;
  property_address: string | null;
  status: string;
  notes: string | null;
  whatsapp_sent_at: string | null;
  listing_id: string | null;
  metadata: Record<string, unknown> | null;
};

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישור הלקוח',
  confirmed: 'מאושר',
  completed: 'בוצע',
  cancelled: 'בוטל',
};

/**
 * A tour counts as confirmed ONLY when the client explicitly accepted it.
 * Creating a tour in the app never means the client agreed, so anything that
 * is not an explicit acceptance is shown as "waiting for the client".
 */
function displayStatus(t: Tour): string {
  if (t.status !== 'confirmed') return t.status;
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  const accepted =
    meta.client_confirmed_at ??
    meta.confirmed_by_client_at ??
    meta.client_accepted_at ??
    (meta.confirmed_by === 'client' ? true : null) ??
    meta.confirmed_by_agent_at;
  return accepted ? 'confirmed' : 'pending';
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
};

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function ScheduledToursCard({ view: controlledView, onViewChange }: { view?: ScheduleView; onViewChange?: (view: ScheduleView) => void } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [internalView, setInternalView] = useState<ScheduleView>('list');
  const view = controlledView ?? internalView;
  const setView = onViewChange ?? setInternalView;
  const [monthCursor, setMonthCursor] = useState(startOfThisMonth);
  const [openDay, setOpenDay] = useState<string | null>(() => todayKey());
  /** Tour whose status pill was clicked, awaiting a manual client confirmation. */
  const [confirmTarget, setConfirmTarget] = useState<Tour | null>(null);
  /** Tour being cancelled, awaiting the "notify the client?" choice. */
  const [cancelTarget, setCancelTarget] = useState<Tour | null>(null);
  const [editTarget, setEditTarget] = useState<Tour | null>(null);

  // Tours belong to ONE workspace only — never show another workspace's tours.
  const ownerId = useActiveWorkspaceOwnerId();
  const { data: tours = [], isLoading } = useQuery({
    queryKey: ['scheduled-tours', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('property_tours')
        .select('id, client_name, client_phone, client_email, scheduled_at, property_title, property_address, status, notes, whatsapp_sent_at, listing_id, metadata')
        .eq('owner_id', ownerId!)
        .gte('scheduled_at', since)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Tour[];
    },
  });

  /** Contacts of this workspace, matched to a tour by phone number. */
  const { data: contacts } = useQuery({
    queryKey: ['tour-contact-index', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, phone_number, profile_picture_url')
        .eq('workspace_owner_id', ownerId!)
        .limit(2000);
      const map = new Map<string, { id: string; avatar: string | null }>();
      for (const row of (data ?? []) as any[]) {
        const key = String(row.phone_number ?? '').replace(/\D/g, '').slice(-9);
        if (key) map.set(key, { id: String(row.id), avatar: row.profile_picture_url ?? null });
      }
      return map;
    },
  });

  const phoneKey = (phone: string | null) => String(phone ?? '').replace(/\D/g, '').slice(-9);
  const avatarOf = (phone: string | null) => contacts?.get(phoneKey(phone))?.avatar ?? null;
  const leadIdOf = (phone: string | null) => contacts?.get(phoneKey(phone))?.id ?? null;

  /**
   * Cover photo of every property that has a scheduled tour, so each tour row
   * shows the real thumbnail instead of an empty placeholder.
   */
  const listingIds = useMemo(
    () => Array.from(new Set(tours.map((t) => t.listing_id).filter(Boolean) as string[])),
    [tours],
  );
  const { data: listingPhotos } = useQuery({
    queryKey: ['tour-listing-photos', ownerId, listingIds.join(',')],
    enabled: listingIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, image_url, media_photos')
        .in('id', listingIds);
      const map = new Map<string, string>();
      for (const row of (data ?? []) as any[]) {
        const arr = Array.isArray(row.media_photos) ? row.media_photos : [];
        const fromArray = arr
          .map((item: any) =>
            typeof item === 'string'
              ? item
              : item && typeof item === 'object'
                ? (typeof item.url === 'string' ? item.url : typeof item.src === 'string' ? item.src : null)
                : null,
          )
          .find((u: string | null) => !!u && /^(https?:\/\/|\/)/.test(u));
        const url = (typeof row.image_url === 'string' && row.image_url.trim()) || fromArray || null;
        if (url) map.set(String(row.id), url);
      }
      return map;
    },
  });



  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('property_tours').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-tours'] }),
  });

  /** Marks the tour as confirmed ONLY as an explicit client acceptance. */
  const confirmByClient = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const current = tours.find((t) => t.id === id);
      const meta = { ...(current?.metadata ?? {}), client_confirmed_at: new Date().toISOString() };
      const { error } = await supabase
        .from('property_tours')
        .update({ status: 'confirmed', metadata: meta as any })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הסיור סומן כמאושר על ידי הלקוח');
      qc.invalidateQueries({ queryKey: ['scheduled-tours'] });
    },
    onError: () => toast.error('עדכון האישור נכשל'),
  });

  /**
   * Cancels a tour and, when the broker chooses to, lets the client know on
   * WhatsApp through the official gateway.
   */
  const cancelTour = useMutation({
    mutationFn: async ({ tour, notify }: { tour: Tour; notify: boolean }) => {
      const { error } = await supabase
        .from('property_tours')
        .update({ status: 'cancelled' })
        .eq('id', tour.id);
      if (error) throw error;
      if (!notify || !tour.client_phone) return { notified: false };
      const where = tour.property_title || tour.property_address || 'הנכס';
      const { error: waError } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phone_number: tour.client_phone,
          message:
            `שלום ${tour.client_name || ''}, זו ריטה מהמשרד 🙂\n` +
            `הסיור ב${where} בתאריך ${formatWhen(tour.scheduled_at)} בוטל.\n` +
            `נשמח לתאם מועד חדש — אפשר להשיב כאן.`,
          ...(ownerId ? { tenant_id: ownerId } : {}),
        },
      });
      if (waError) throw waError;
      return { notified: true };
    },
    onSuccess: (res) => {
      toast.success(res?.notified ? 'הסיור בוטל והלקוח קיבל הודעה' : 'הסיור בוטל');
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ['scheduled-tours'] });
    },
    onError: () => toast.error('ביטול הסיור נכשל'),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Tour[]>();
    for (const t of tours) {
      const k = dayKey(t.scheduled_at);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [tours]);

  function DigiformAction({ t }: { t: Tour }) {
    const leadId = leadIdOf(t.client_phone);
    const { data: formSent = false } = useQuery({
      queryKey: ['tour-digiform-sent', leadId, t.listing_id],
      enabled: !!leadId,
      queryFn: async () => {
        let query = supabase
          .from('closing_documents')
          .select('id')
          .eq('lead_id', leadId as string)
          .eq('template_key', 'tour_agreement')
          .not('sent_at', 'is', null)
          .limit(1);
        if (t.listing_id) query = query.eq('listing_id', t.listing_id);
        const { data, error } = await query;
        if (error) throw error;
        return (data?.length ?? 0) > 0;
      },
    });

    if (formSent) return null;
    return (
      <DigitalSignatureButton
        lead={leadId ? { id: leadId, full_name: t.client_name, phone_number: t.client_phone } : null}
        listingId={t.listing_id}
        label="שליחת טופס דיגיטלי"
        className="mt-2"
      />
    );
  }

  function TourRow({ t }: { t: Tour }) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 hover:text-primary"
              onClick={() => {
                const leadId = leadIdOf(t.client_phone);
                if (leadId) navigate(`/lead-crm/${leadId}`);
              }}
              disabled={!leadIdOf(t.client_phone)}
              aria-label={`פתיחת כרטיס איש קשר של ${t.client_name}`}
            >
              <ContactAvatar name={t.client_name} imageUrl={avatarOf(t.client_phone)} className="h-8 w-8" />
              <span className="truncate hover:underline">{t.client_name}</span>
            </button>
            {leadIdOf(t.client_phone) ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-[hsl(var(--social-whatsapp))]"
                onClick={() => navigate(`/inbox?lead=${leadIdOf(t.client_phone)}&channel=whatsapp`)}
                aria-label="פתיחת WhatsApp"
                title="WhatsApp"
              >
                <BrandIcon name="whatsapp" className="h-4 w-4" />
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
              <a href={`tel:${t.client_phone}`} aria-label="שיחת טלפון" title="שיחת טלפון">
                <Phone className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditTarget(t)}
                aria-label="עריכת הסיור"
                title="עריכה"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {t.status !== 'completed' ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-[hsl(var(--success))]"
                  onClick={() => setStatus.mutate({ id: t.id, status: 'completed' })}
                  aria-label="סימון הסיור כבוצע"
                  title="בוצע"
                >
                  <Check className="h-4 w-4" />
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => setCancelTarget(t)}
                aria-label="ביטול הסיור"
                title="ביטול"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <button type="button" onClick={() => setConfirmTarget(t)} title="לחיצה לעדכון אישור הלקוח">
              <Badge variant="outline" className={`cursor-pointer transition-opacity hover:opacity-80 ${STATUS_CLASS[displayStatus(t)] ?? ''}`}>
                {STATUS_HE[displayStatus(t)] ?? t.status}
              </Badge>
            </button>
          </div>
        </div>
        <div className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatWhen(t.scheduled_at)}
          </p>
          {(t.property_title || t.property_address) && (
            <div className="flex items-center gap-2">
              {t.listing_id && listingPhotos?.get(t.listing_id) ? (
                <img
                  src={listingPhotos.get(t.listing_id) as string}
                  alt={t.property_title ?? 'תמונת הנכס'}
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-md border object-cover"
                />
              ) : null}
              <p className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.property_title || t.property_address}</span>
              </p>
            </div>
          )}
          <p className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            <a href={`tel:${t.client_phone}`} className="hover:underline">{formatPhoneDisplay(t.client_phone)}</a>
            {t.whatsapp_sent_at ? <span className="text-emerald-600">· אישור נשלח</span> : null}
          </p>
          {t.client_email ? (
            <p className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {t.client_email}
            </p>
          ) : null}
          {t.notes ? (
            <p className="flex items-start gap-1.5 text-[12px]">
              <StickyNote className="mt-0.5 h-3.5 w-3.5" />
              {t.notes}
            </p>
          ) : null}
        </div>
        <SignatureStatusStrip leadId={leadIdOf(t.client_phone)} listingId={t.listing_id} />
        <DigiformAction t={t} />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-3">
      <NewTourDialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        tour={editTarget as EditableTour | null}
      />
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : view === 'list' ? (
        tours.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">אין סיורים מתוזמנים כרגע</p>
        ) : (
          tours.map((t) => <TourRow key={t.id} t={t} />)
        )
      ) : (
        <ScheduleMonthGrid
          items={tours.map((t) => ({ id: t.id, at: t.scheduled_at, label: t.client_name, tour: t }))}
          monthCursor={monthCursor}
          openDay={openDay}
          onOpenDay={setOpenDay}
          emptyLabel="אין סיורים ביום שנבחר"
          renderItem={(item) => <TourRow key={item.id} t={item.tour} />}
        />
      )}

      {/* Manual client confirmation, opened by clicking the status pill. */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לסמן שהלקוח אישר את המועד?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `${confirmTarget.client_name} · ${formatWhen(confirmTarget.scheduled_at)}`
                : ''}
              {' '}הסטטוס יתעדכן ל"מאושר" והאירוע יישמר ביומן.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmTarget) confirmByClient.mutate({ id: confirmTarget.id });
                setConfirmTarget(null);
              }}
            >
              הלקוח אישר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancellation, with an explicit "notify the client on WhatsApp?" choice. */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את הסיור?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget ? `${cancelTarget.client_name} · ${formatWhen(cancelTarget.scheduled_at)}. ` : ''}
              רוצה שנעדכן את הלקוח בוואטסאפ על הביטול?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel disabled={cancelTour.isPending}>חזרה</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={cancelTour.isPending}
              onClick={() => { if (cancelTarget) cancelTour.mutate({ tour: cancelTarget, notify: false }); }}
            >
              בטל בלי להודיע
            </Button>
            <Button
              disabled={cancelTour.isPending}
              onClick={() => { if (cancelTarget) cancelTour.mutate({ tour: cancelTarget, notify: true }); }}
            >
              {cancelTour.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
              בטל והודע בוואטסאפ
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ScheduledToursCard;

/**
 * Live count of upcoming tours in the ACTIVE workspace only.
 * Used by the tabs bar to show "סיורים (n)".
 */
export function useScheduledToursCount() {
  const ownerId = useActiveWorkspaceOwnerId();
  const { data } = useQuery({
    queryKey: ['scheduled-tours-count', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('property_tours')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId!)
        .gte('scheduled_at', since)
        .neq('status', 'cancelled');
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}
