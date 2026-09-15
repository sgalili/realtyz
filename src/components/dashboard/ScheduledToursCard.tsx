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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  StickyNote,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { sendViaOfficialWaba } from '@/lib/officialWa';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';

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

export function ScheduledToursCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [monthCursor, setMonthCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [openDay, setOpenDay] = useState<string | null>(() => dayKey(new Date().toISOString()));
  const [sendingId, setSendingId] = useState<string | null>(null);

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

  const byDay = useMemo(() => {
    const map = new Map<string, Tour[]>();
    for (const t of tours) {
      const k = dayKey(t.scheduled_at);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [tours]);

  /** Opens the omnichannel inbox on the matching lead (by phone). */
  async function openOmnichat(t: Tour) {
    const digits = (t.client_phone || '').replace(/\D/g, '');
    const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
    try {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .or(`phone_number.eq.${intl},phone_number.eq.0${intl.slice(3)}`)
        .limit(1)
        .maybeSingle();
      const leadId = (data as any)?.id as string | undefined;
      navigate(leadId ? `/inbox?lead=${leadId}&channel=whatsapp` : '/inbox');
      if (!leadId) toast.info('לא נמצאה שיחה קיימת — נפתח האומני-צ׳אט');
    } catch {
      navigate('/inbox');
    }
  }

  /** Sends a reminder from the OFFICIAL WABA number only. */
  async function sendReminder(t: Tour) {
    setSendingId(t.id);
    const where = t.property_title || t.property_address || 'הנכס';
    const msg = `שלום ${t.client_name}, מזכיר את הסיור ב${where} בתאריך ${formatWhen(t.scheduled_at)}. נתראה!`;
    const res = await sendViaOfficialWaba({ phone_number: t.client_phone, message: msg });
    setSendingId(null);
    if (res.ok) toast.success('תזכורת נשלחה מהמספר הרשמי');
    else toast.error(res.error || 'שליחת התזכורת נכשלה');
  }

  function TourActions({ t }: { t: Tour }) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => openOmnichat(t)}>
          <MessageSquare className="me-1 h-3.5 w-3.5" />
          אומני-צ׳אט
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-[12px]"
          disabled={sendingId === t.id}
          onClick={() => sendReminder(t)}
        >
          {sendingId === t.id ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <Send className="me-1 h-3.5 w-3.5" />}
          וואטסאפ רשמי
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-[12px]" asChild>
          <a href={`tel:${t.client_phone}`}>
            <Phone className="me-1 h-3.5 w-3.5" />
            שיחה
          </a>
        </Button>
        {t.client_email ? (
          <Button size="sm" variant="outline" className="h-8 text-[12px]" asChild>
            <a href={`mailto:${t.client_email}`}>
              <Mail className="me-1 h-3.5 w-3.5" />
              אימייל
            </a>
          </Button>
        ) : null}
        {t.status !== 'confirmed' && (
          <Button size="sm" variant="secondary" className="h-8 text-[12px]" onClick={() => setStatus.mutate({ id: t.id, status: 'confirmed' })}>
            אישור
          </Button>
        )}
        {t.status !== 'completed' && (
          <Button size="sm" variant="secondary" className="h-8 text-[12px]" onClick={() => setStatus.mutate({ id: t.id, status: 'completed' })}>
            בוצע
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => setStatus.mutate({ id: t.id, status: 'cancelled' })}>
          ביטול
        </Button>
      </div>
    );
  }

  function TourRow({ t }: { t: Tour }) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ContactAvatar
              name={t.client_name}
              imageUrl={avatarOf(t.client_phone)}
              className="h-8 w-8"
            />
            {t.client_name}
          </div>
          <Badge variant="outline" className={STATUS_CLASS[t.status] ?? ''}>
            {STATUS_HE[t.status] ?? t.status}
          </Badge>
        </div>
        <div className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatWhen(t.scheduled_at)}
          </p>
          {(t.property_title || t.property_address) && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {t.property_title || t.property_address}
            </p>
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
        <TourActions t={t} />
      </div>
    );
  }

  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = Array.from({ length: startOffset }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const selectedDayTours = openDay ? byDay.get(openDay) ?? [] : [];

  return (
    <Card dir="rtl">
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            size="icon"
            variant={view === 'list' ? 'default' : 'ghost'}
            aria-label="רשימה"
            className="h-8 w-8"
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          {view === 'calendar' && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="min-w-[7.5rem] text-center text-sm font-semibold">
                {monthCursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            size="icon"
            variant={view === 'calendar' ? 'default' : 'ghost'}
            aria-label="לוח שנה"
            className="h-8 w-8"
            onClick={() => setView('calendar')}
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
        </div>


        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : view === 'list' ? (
          tours.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">אין סיורים מתוזמנים כרגע</p>
          ) : (
            tours.map((t) => <TourRow key={t.id} t={t} />)
          )
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
              {DAY_LABELS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="h-16 rounded-md bg-muted/10" />;
                const k = dayKey(d.toISOString());
                const list = byDay.get(k) ?? [];
                const isSelected = openDay === k;
                const isToday = k === dayKey(new Date().toISOString());
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOpenDay(k)}
                    className={`h-16 rounded-md border p-1 text-right transition-colors ${
                      isSelected ? 'border-primary bg-primary/10' : 'bg-muted/20 hover:bg-muted/40'
                    } ${isToday ? 'ring-1 ring-primary/50' : ''}`}
                  >
                    <span className="block text-[11px] font-semibold text-foreground">{d.getDate()}</span>
                    <span className="mt-0.5 block space-y-0.5">
                      {list.slice(0, 2).map((t) => (
                        <span key={t.id} className="block truncate rounded bg-primary/15 px-1 text-[10px] text-primary">
                          {formatTime(t.scheduled_at)} {t.client_name}
                        </span>
                      ))}
                      {list.length > 2 ? (
                        <span className="block text-[10px] text-muted-foreground">+{list.length - 2}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {selectedDayTours.length === 0 ? (
                <p className="py-2 text-center text-[13px] text-muted-foreground">אין סיורים ביום שנבחר</p>
              ) : (
                selectedDayTours.map((t) => <TourRow key={t.id} t={t} />)
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScheduledToursCard;
