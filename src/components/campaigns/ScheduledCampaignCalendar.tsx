import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Pencil, Plus, Calendar as CalendarIcon, ArrowRight, X, Users, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { loadSchedulePrefs, saveSchedulePrefs, randomSlotMinutes } from '@/lib/schedulePrefs';
import { cn } from '@/lib/utils';

type ScheduledRow = {
  id: string;
  campaign_name: string;
  channel: string;
  message_body: string | null;
  created_at: string;
  sent_at: string | null;
  status: string | null;
  provider_message_id: string | null;
  provider_response: any;
};

const CHANNEL_COLORS: Record<string, string> = {
  facebook:  'bg-blue-100 text-blue-800 ring-blue-200',
  instagram: 'bg-pink-100 text-pink-800 ring-pink-200',
  x:         'bg-slate-200 text-slate-900 ring-slate-300',
  twitter:   'bg-slate-200 text-slate-900 ring-slate-300',
  tiktok:    'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200',
  linkedin:  'bg-sky-100 text-sky-800 ring-sky-200',
  youtube:   'bg-red-100 text-red-800 ring-red-200',
  email:     'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type ListingLite = {
  id: string;
  property_title: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  asking_price: number | null;
};

const listingLabel = (l: ListingLite) => {
  const loc = [l.address || l.property_title || 'נכס', l.neighborhood, l.city].filter(Boolean).join(', ');
  const price = l.asking_price ? ` — ${Number(l.asking_price).toLocaleString('he-IL')} ₪` : '';
  return `${loc}${price}`;
};

export function ScheduledCampaignCalendar({ onCreateAt, onClose }: { onCreateAt: (iso: string, extras?: { listing?: string | null; variant?: number; totalVariants?: number; groupIds?: string[]; properties?: string[]; assignments?: Array<{ iso: string; listing: string | null; variant: number; totalVariants: number }> }) => void; onClose?: () => void }) {
  const queryClient = useQueryClient();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [editing, setEditing] = useState<ScheduledRow | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editWhen, setEditWhen] = useState('');
  const [saving, setSaving] = useState(false);
  const [scheduleDay, setScheduleDay] = useState<Date | null>(null);
  const [winStart, setWinStart] = useState('09:00');
  const [winEnd, setWinEnd] = useState('21:00');
  const [winCount, setWinCount] = useState(1);
  const [listings, setListings] = useState<ListingLite[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [listingSearch, setListingSearch] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]); // 0=Sun..6=Sat
  const [recurrenceCount, setRecurrenceCount] = useState<number>(4); // iterations
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [brandingPost, setBrandingPost] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [listingsPopoverOpen, setListingsPopoverOpen] = useState(false);

  // Restore the broker's last dialog configuration (window, count, recurrence,
  // properties, groups) every time the dialog opens — it survives refreshes.
  useEffect(() => {
    if (!scheduleDay) return;
    let cancelled = false;
    const prefs = loadSchedulePrefs(workspaceOwnerId);
    setListingsLoading(true);
    setListingSearch('');
    setWinStart(prefs.winStart);
    setWinEnd(prefs.winEnd);
    setWinCount(prefs.winCount);
    setSelectedListingIds(prefs.selectedListingIds);
    setSelectedGroupIds(prefs.selectedGroupIds);
    setRecurrence(prefs.recurrence);
    setRecurrenceDays(prefs.recurrenceDays);
    setRecurrenceCount(prefs.recurrenceCount);
    setRecurrenceOpen(false);
    setBrandingPost(prefs.selectedListingIds.length === 0);
    setPropertiesOpen(false);
    (async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, property_title, city, neighborhood, address, asking_price, status, is_published, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.error('[Calendar] listings fetch failed', error);
        setListings([]);
      } else {
        setListings((data || []) as ListingLite[]);
      }
      setListingsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [scheduleDay, workspaceOwnerId]);

  // Persist every configuration change so it survives leaving the page.
  useEffect(() => {
    if (!scheduleDay) return;
    saveSchedulePrefs(workspaceOwnerId, {
      winStart, winEnd, winCount, recurrence, recurrenceDays, recurrenceCount,
      selectedListingIds, selectedGroupIds,
    });
  }, [scheduleDay, workspaceOwnerId, winStart, winEnd, winCount, recurrence, recurrenceDays, recurrenceCount, selectedListingIds, selectedGroupIds]);

  // The number of posts follows the number of properties picked in the dropdown.
  useEffect(() => {
    if (!scheduleDay) return;
    if (selectedListingIds.length > 0) {
      setWinCount(Math.min(20, selectedListingIds.length));
    }
  }, [selectedListingIds, scheduleDay]);


  const filteredListings = useMemo(() => {
    const q = listingSearch.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => {
      const hay = [l.property_title, l.city, l.neighborhood, l.address, l.asking_price ? String(l.asking_price) : '']
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [listings, listingSearch]);

  const [autoJumped, setAutoJumped] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('campaign_logs')
      .select('id, campaign_name, channel, message_body, created_at, sent_at, status, provider_message_id, provider_response')
      .eq('is_archived', false)
      .in('status', ['scheduled', 'pending'])
      .gt('sent_at', new Date().toISOString())
      .order('sent_at', { ascending: true })
      .limit(1000);
    if (error) {
      toast.error('טעינת מתוזמנים נכשלה: ' + error.message);
      setRows([]);
    } else {
      // De-duplicate identical campaigns (same name+channel+sent_at) so a
      // single scheduled post that fanned out to multiple leads renders as
      // one card on the calendar.
      const seen = new Map<string, ScheduledRow>();
      for (const r of (data || []) as ScheduledRow[]) {
        const key = `${r.campaign_name}|${r.channel}|${r.sent_at}`;
        if (!seen.has(key)) seen.set(key, r);
      }
      const deduped = Array.from(seen.values());
      setRows(deduped);
      // Auto-jump to the first month that actually contains scheduled
      // posts so future recurrences never appear "missing" just because
      // the calendar defaulted to today's empty month.
      if (!autoJumped && deduped.length > 0) {
        const currentMonthHas = deduped.some((r) => {
          if (!r.sent_at) return false;
          const d = new Date(r.sent_at);
          return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
        });
        if (!currentMonthHas) {
          const first = new Date(deduped[0].sent_at as string);
          const jump = new Date(first.getFullYear(), first.getMonth(), 1);
          setCursor(jump);
        }
        setAutoJumped(true);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);


  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(cursor);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - startWeekday);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const rowsByDay = useMemo(() => {
    const map = new Map<string, ScheduledRow[]>();
    for (const r of rows) {
      if (!r.sent_at) continue;
      const d = new Date(r.sent_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  const openEditor = (r: ScheduledRow) => {
    setEditing(r);
    setEditBody(r.message_body || '');
    setEditWhen(r.sent_at ? toLocalInput(new Date(r.sent_at)) : '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    const when = editWhen ? new Date(editWhen) : null;
    if (!when || Number.isNaN(when.getTime())) {
      toast.error('בחר תאריך ושעה תקפים');
      return;
    }
    if (when.getTime() <= Date.now() + 30_000) {
      toast.error('הזמן חייב להיות לפחות 30 שניות קדימה');
      return;
    }
    setSaving(true);
    // Update all rows in the same scheduled batch (same campaign_name +
    // channel + original sent_at) so a fan-out broadcast moves as one unit.
    const { error } = await supabase
      .from('campaign_logs')
      .update({ sent_at: when.toISOString(), message_body: editBody })
      .eq('campaign_name', editing.campaign_name)
      .eq('channel', editing.channel)
      .eq('sent_at', editing.sent_at!);
    setSaving(false);
    if (error) { toast.error('עדכון נכשל: ' + error.message); return; }
    toast.success('הקמפיין עודכן · שים לב שעדכון אצל ספק הפרסום עשוי לדרוש פרסום מחדש');
    setEditing(null);
    load();
  };

  const cancelScheduled = async (r: ScheduledRow) => {
    if (!confirm('לבטל את הפרסום המתוזמן הזה?')) return;
    // Try to cancel on Meta for posts that already received an external id.
    const externalIds = Array.from(new Set([
      r.provider_message_id,
      ...((r.provider_response as any)?.postIds || [])
        .map((p: any) => p?.id ?? p?.postId)
        .filter(Boolean),
    ].filter(Boolean) as string[]));
    if (externalIds.length > 0) {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/meta-publish`;
      for (const pid of externalIds) {
        try {
          await fetch(fnUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${accessToken ?? ''}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ external_post_id: pid }),
          });
        } catch { /* fall through to local delete */ }
      }
    }
    const { error } = await supabase
      .from('campaign_logs')
      .delete()
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .eq('sent_at', r.sent_at!);
    if (error) { toast.error('ביטול נכשל: ' + error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
    toast.success('הפרסום המתוזמן בוטל');
    load();
  };

  // Cancel the ENTIRE recurrence sequence — every future scheduled post that
  // shares the same campaign_name + channel as the selected row.
  const cancelSequence = async (r: ScheduledRow) => {
    const { data: siblings, error: fetchErr } = await supabase
      .from('campaign_logs')
      .select('id, sent_at, provider_message_id, provider_response')
      .eq('is_archived', false)
      .eq('status', 'scheduled')
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .gt('sent_at', new Date().toISOString());
    if (fetchErr) { toast.error('שליפת הסדרה נכשלה: ' + fetchErr.message); return; }
    const count = siblings?.length || 0;
    if (count === 0) { toast.info('אין פרסומים עתידיים בסדרה'); return; }
    if (!confirm(`לבטל את כל הסדרה? (${count} פרסומים עתידיים)`)) return;

    // Cancel every known Meta post id best-effort.
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/meta-publish`;
    const externalIds = new Set<string>();
    for (const s of siblings || []) {
      if (s.provider_message_id) externalIds.add(s.provider_message_id);
      for (const p of ((s.provider_response as any)?.postIds || [])) {
        const id = p?.id ?? p?.postId;
        if (id) externalIds.add(id);
      }
    }
    for (const pid of externalIds) {
      try {
        await fetch(fnUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken ?? ''}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ external_post_id: pid }),
        });
      } catch { /* fall through */ }
    }

    const { error } = await supabase
      .from('campaign_logs')
      .delete()
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .eq('status', 'scheduled')
      .gt('sent_at', new Date().toISOString());
    if (error) { toast.error('ביטול הסדרה נכשל: ' + error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
    toast.success(`הסדרה בוטלה (${count} פרסומים)`);
    load();
  };

  const monthLabel = `${HEBREW_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const today = new Date();

  return (
    <div className="space-y-4" dir="rtl">

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() - 1);
              setCursor(d);
            }}
            aria-label="חודש קודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-bold text-foreground tabular-nums">{monthLabel}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() + 1);
              setCursor(d);
            }}
            aria-label="חודש הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              d.setHours(0, 0, 0, 0);
              setCursor(d);
            }}
          >
            היום
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {loading ? 'טוען…' : `${rows.length} פרסומים מתוזמנים`}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {HEBREW_WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day, idx) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = sameDay(day, today);
            const isPast = day.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const dayRows = rowsByDay.get(key) || [];
            const openSchedule = () => {
              if (isPast) return;
              setScheduleDay(new Date(day));
              setWinStart('09:00');
              setWinEnd('21:00');
              setWinCount(1);
            };
            return (
              <div
                key={idx}
                onClick={openSchedule}
                role={!isPast ? 'button' : undefined}
                className={cn(
                  'group relative min-h-[110px] border-b border-l border-border p-1.5 flex flex-col gap-1',
                  !inMonth && 'bg-muted/20 text-muted-foreground',
                  isToday && 'bg-amber-50/50',
                  !isPast && 'cursor-pointer hover:bg-muted/30 transition-colors',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs font-bold tabular-nums',
                    isToday ? 'text-amber-700' : 'text-foreground',
                  )}>
                    {day.getDate()}
                  </span>
                  {!isPast && (
                    <span
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-slate-900 text-white p-0.5"
                      aria-hidden
                      title="הוסף פרסום מתוזמן"
                    >
                      <Plus className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {dayRows.slice(0, 3).map((r) => {
                    const t = new Date(r.sent_at!);
                    const channel = String(r.channel || '').toLowerCase();
                    const cls = CHANNEL_COLORS[channel] || 'bg-slate-100 text-slate-800 ring-slate-200';
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEditor(r); }}
                        className={cn(
                          'truncate text-right text-[11px] font-semibold rounded-md px-1.5 py-0.5 ring-1 hover:opacity-80 transition-opacity',
                          cls,
                        )}
                        title={`${r.campaign_name} · ${t.toLocaleString('he-IL')}`}
                      >
                        <span className="tabular-nums">{t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="mx-1">·</span>
                        <span className="truncate">{(r.message_body || r.campaign_name).split('\n')[0]}</span>
                      </button>
                    );
                  })}
                  {dayRows.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1">+{dayRows.length - 3} נוספים</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-end">
              <CalendarIcon className="h-4 w-4" />
              עריכת פרסום מתוזמן
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">מועד פרסום</label>
              <Input
                type="datetime-local"
                value={editWhen}
                onChange={(e) => setEditWhen(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">תוכן הפוסט</label>
              <Textarea
                rows={6}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="text-right"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              עדכון מועד או תוכן ישנה את הרשומה במערכת. אם הפוסט כבר נשלח לתור של ספק הפרסום, ייתכן שיידרש לבטל ולפרסם מחדש.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => { if (editing) { const e = editing; setEditing(null); cancelScheduled(e); } }}
            >
              <Trash2 className="ml-1 h-4 w-4" />
              בטל פרסום
            </Button>
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => { if (editing) { const e = editing; setEditing(null); cancelSequence(e); } }}
              title="ביטול כל הפרסומים העתידיים באותה סדרה"
            >
              <Repeat className="ml-1 h-4 w-4" />
              בטל סדרה
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>סגור</Button>
            <Button onClick={saveEdit} disabled={saving}>
              <Pencil className="ml-1 h-4 w-4" />
              {saving ? 'שומר…' : 'שמור שינויים'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleDay} onOpenChange={(o) => { if (!o) setScheduleDay(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-end">
              תזמון פרסומים ליום {scheduleDay?.toLocaleDateString('he-IL')}
            </DialogTitle>

          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-end gap-2 flex-row-reverse">
              <Popover open={recurrenceOpen} onOpenChange={setRecurrenceOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="חזרתיות"
                    aria-label="חזרתיות"
                    className={cn(
                      'relative inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:text-primary transition-colors',
                      recurrence !== 'none' && 'text-primary',
                    )}
                  >
                    <Repeat className="h-5 w-5" />
                    {recurrence !== 'none' && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" className="w-64 p-2" dir="rtl">
                  <div className="text-xs font-semibold text-muted-foreground px-2 py-1">חזרתיות</div>
                  <div className="flex flex-col">
                    {([
                      ['none', 'ללא חזרה'],
                      ['daily', 'בכל יום'],
                      ['weekly', 'בכל שבוע'],
                      ['monthly', 'בכל חודש'],
                      ['custom', 'ימים ושעות נבחרים'],
                    ] as Array<[Recurrence, string]>).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRecurrence(key)}
                        className={cn(
                          'text-right text-sm rounded-md px-2 py-1.5 hover:bg-muted/60',
                          recurrence === key && 'bg-primary/10 text-primary font-semibold',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {recurrence === 'custom' && (
                    <div className="mt-2 border-t pt-2">
                      <div className="text-[11px] text-muted-foreground mb-1 text-right">בחר ימי שבוע</div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {HEBREW_WEEKDAYS.map((d, i) => {
                          const active = recurrenceDays.includes(i);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() =>
                                setRecurrenceDays((prev) =>
                                  prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                                )
                              }
                              className={cn(
                                'h-7 w-7 text-[11px] rounded-full border',
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border hover:bg-muted/60',
                              )}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {recurrence !== 'none' && (
                    <div className="mt-2 border-t pt-2">
                      <label className="text-[11px] text-muted-foreground block mb-1 text-right">
                        {recurrence === 'weekly' || recurrence === 'custom'
                          ? 'מספר שבועות'
                          : recurrence === 'monthly' ? 'מספר חודשים' : 'מספר ימים'}
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        value={recurrenceCount}
                        onChange={(e) => setRecurrenceCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                        className="h-8 text-right"
                      />
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <div className="flex-1">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">עד שעה</label>
                <Input
                  type="time"
                  value={winEnd}
                  onChange={(e) => setWinEnd(e.target.value)}
                  dir="rtl"
                  className="text-left [&::-webkit-datetime-edit]:text-left [&::-webkit-datetime-edit-fields-wrapper]:justify-start [&::-webkit-datetime-edit-fields-wrapper]:w-full [&::-webkit-calendar-picker-indicator]:order-last [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:mr-0"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">משעה</label>
                <Input
                  type="time"
                  value={winStart}
                  onChange={(e) => setWinStart(e.target.value)}
                  dir="rtl"
                  className="text-left [&::-webkit-datetime-edit]:text-left [&::-webkit-datetime-edit-fields-wrapper]:justify-start [&::-webkit-datetime-edit-fields-wrapper]:w-full [&::-webkit-calendar-picker-indicator]:order-last [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:mr-0"
                />
              </div>

            </div>
            <div className="flex items-end gap-2 flex-row-reverse">
              <div className="w-28">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">כמות פוסטים</label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={winCount}
                  onChange={(e) => setWinCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="text-right"
                />
              </div>
              <div className="flex-1">
                <Popover open={listingsPopoverOpen} onOpenChange={setListingsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      dir="rtl"
                      onClick={() => setListingsPopoverOpen((v) => !v)}
                      className="w-full h-9 flex items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-right hover:bg-muted/40"
                    >
                      <span className={cn('truncate', selectedListingIds.length === 0 && 'text-muted-foreground')}>
                        {selectedListingIds.length === 0 ? 'פוסט תדמיתי' : `נכסים נבחרו (${selectedListingIds.length})`}
                      </span>
                      <ChevronLeft className={cn('h-4 w-4 text-muted-foreground transition-transform shrink-0', listingsPopoverOpen && '-rotate-90')} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    className="p-0 w-[--radix-popover-trigger-width]"
                    dir="rtl"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div className="sticky top-0 z-10 p-2 border-b border-border bg-card">
                      <Input
                        autoFocus
                        placeholder="חיפוש נכס..."
                        value={listingSearch}
                        onChange={(e) => setListingSearch(e.target.value)}
                        className="h-8 text-right"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                      {listingsLoading ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground text-center">טוען נכסים…</div>
                      ) : filteredListings.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground text-center">לא נמצאו נכסים</div>
                      ) : (
                        filteredListings.map((l) => {
                          const checked = selectedListingIds.includes(l.id);
                          return (
                            <label
                              key={l.id}
                              className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/60 text-xs',
                                checked && 'bg-muted/80',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedListingIds((prev) => {
                                    const next = e.target.checked ? [...prev, l.id] : prev.filter((id) => id !== l.id);
                                    setBrandingPost(next.length === 0);
                                    return next;
                                  });
                                }}
                                className="h-3.5 w-3.5 accent-slate-900"
                              />
                              <span className="truncate text-right flex-1">{listingLabel(l)}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {selectedListingIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedListingIds.map((id) => {
                      const l = listings.find((x) => x.id === id);
                      if (!l) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-800 ring-1 ring-slate-200 px-2 py-0.5 text-[11px]">
                          <span className="truncate max-w-[160px]">{listingLabel(l)}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedListingIds((prev) => {
                              const next = prev.filter((x) => x !== id);
                              setBrandingPost(next.length === 0);
                              return next;
                            })}
                            className="opacity-60 hover:opacity-100"
                            aria-label="הסר"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>



          </div>
          <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2 w-full items-center">
            <Button variant="outline" onClick={() => setScheduleDay(null)}>ביטול</Button>
            <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="בחר קבוצות פייסבוק לפרסום"
                  aria-label="קבוצות פייסבוק"
                  className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:text-primary transition-colors"
                >
                  <Users className="h-5 w-5" />
                  {selectedGroupIds.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {selectedGroupIds.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-[360px] p-0" dir="rtl">
                <CampaignGroupSelector
                  selectedIds={selectedGroupIds}
                  onChange={setSelectedGroupIds}
                  className="border-0 shadow-none"
                />
              </PopoverContent>
            </Popover>
            <Button
              onClick={() => {
                if (!scheduleDay) return;
                const [sh, sm] = winStart.split(':').map(Number);
                const [eh, em] = winEnd.split(':').map(Number);
                const startMin = sh * 60 + (sm || 0);
                const endMin = eh * 60 + (em || 0);
                if (endMin <= startMin) {
                  toast.error('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
                  return;
                }
                const n = Math.max(1, winCount);
                const span = endMin - startMin;
                const bucket = span / n;
                // Build per-day slots within the time window
                const buildDaySlots = (base: Date): Date[] => {
                  const out: Date[] = [];
                  for (let i = 0; i < n; i++) {
                    // Never fire exactly on the window edges — always a random
                    // minute somewhere in between.
                    const offset = randomSlotMinutes(startMin, endMin, i, n);
                    const total = Math.floor(offset);
                    const d = new Date(base);
                    d.setHours(Math.floor(total / 60), total % 60, Math.floor(Math.random() * 60), 0);
                    if (d.getTime() <= Date.now() + 60_000) {
                      d.setTime(Date.now() + (i + 1) * 5 * 60_000);
                    }
                    out.push(d);
                  }
                  return out;
                };

                // Expand the base day across the chosen recurrence pattern.
                const recurrenceDates: Date[] = [];
                if (recurrence === 'none') {
                  recurrenceDates.push(new Date(scheduleDay));
                } else if (recurrence === 'daily') {
                  for (let i = 0; i < recurrenceCount; i++) {
                    const d = new Date(scheduleDay); d.setDate(d.getDate() + i);
                    recurrenceDates.push(d);
                  }
                } else if (recurrence === 'weekly') {
                  for (let i = 0; i < recurrenceCount; i++) {
                    const d = new Date(scheduleDay); d.setDate(d.getDate() + i * 7);
                    recurrenceDates.push(d);
                  }
                } else if (recurrence === 'monthly') {
                  for (let i = 0; i < recurrenceCount; i++) {
                    const d = new Date(scheduleDay); d.setMonth(d.getMonth() + i);
                    recurrenceDates.push(d);
                  }
                } else if (recurrence === 'custom') {
                  if (recurrenceDays.length === 0) {
                    toast.error('בחר לפחות יום אחד בשבוע');
                    return;
                  }
                  const weeks = Math.max(1, recurrenceCount);
                  // Walk forward from scheduleDay across the chosen number of weeks
                  for (let w = 0; w < weeks; w++) {
                    for (let dow = 0; dow < 7; dow++) {
                      if (!recurrenceDays.includes(dow)) continue;
                      const base = new Date(scheduleDay);
                      // Shift to start of week containing scheduleDay
                      base.setDate(base.getDate() - base.getDay() + dow + w * 7);
                      if (base.getTime() < new Date(scheduleDay.getFullYear(), scheduleDay.getMonth(), scheduleDay.getDate()).getTime()) continue;
                      recurrenceDates.push(base);
                    }
                  }
                }

                const slots: Date[] = recurrenceDates
                  .flatMap((day) => buildDaySlots(day))
                  .sort((a, b) => a.getTime() - b.getTime());

                // Persist the per-group daily cap the broker typed.
                if (selectedGroupIds.length > 0) {
                  void saveGroupDailyLimit(selectedGroupIds, groupDailyLimit > 0 ? groupDailyLimit : null);
                }

                // Distribute properties across slots RANDOMLY (each cycle is a
                // fresh shuffle, so no run posts the properties in list order)
                // and compute per-listing variant index so the composer can
                // synthesize distinct copy variations when a property repeats.
                const shuffleIds = (arr: string[]) => {
                  const out = [...arr];
                  for (let i = out.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [out[i], out[j]] = [out[j], out[i]];
                  }
                  return out;
                };
                const picks: string[] = [];
                if (selectedListingIds.length > 0) {
                  while (picks.length < slots.length) picks.push(...shuffleIds(selectedListingIds));
                }
                const perListingTotal = new Map<string, number>();
                for (let i = 0; i < slots.length && picks.length > 0; i++) {
                  const lid = picks[i];
                  perListingTotal.set(lid, (perListingTotal.get(lid) || 0) + 1);
                }
                const seenByListing = new Map<string, number>();
                const assignments = slots.map((d, i) => {
                  const lid = picks.length > 0 ? picks[i] : null;
                  let variant = 1;
                  let totalVariants = 1;
                  if (lid) {
                    const next = (seenByListing.get(lid) || 0) + 1;
                    seenByListing.set(lid, next);
                    variant = next;
                    totalVariants = perListingTotal.get(lid) || 1;
                  }
                  return { iso: d.toISOString(), listing: lid, variant, totalVariants };
                });


                try {
                  sessionStorage.setItem('rz-schedule-queue', JSON.stringify(assignments.slice(1)));
                  sessionStorage.setItem('rz-schedule-assignments', JSON.stringify(assignments));
                } catch {}
                if (n > 1) toast.success(`נוצרו ${n} חלונות תזמון · נטענו לעורך`);
                setScheduleDay(null);
                const first = assignments[0];
                onCreateAt(first.iso, {
                  listing: first.listing,
                  variant: first.variant,
                  totalVariants: first.totalVariants,
                  groupIds: selectedGroupIds,
                  properties: selectedListingIds,
                  assignments,
                });
              }}
            >
              צור וטען לעורך
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
