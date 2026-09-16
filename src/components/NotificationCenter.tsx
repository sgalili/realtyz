import { useEffect, useRef, useState } from 'react';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Bell, AlertTriangle, ExternalLink, Wallet, MessageCircle, CalendarClock, Trash2, UserPlus } from 'lucide-react';
import { useNotificationStates } from '@/hooks/useNotificationStates';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';


const ALERT_KEYWORDS = ['עצבני', 'שקר', 'תפסיקו', 'כועס', 'מתנגד', 'עזבו', 'נמאס'];

const SERVICE_LABELS: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  voice: 'שיחה קולית AI',
  meta_ads: 'מודעות Meta',
  ai_touchpoint: 'נקודת מגע AI',
};

// One-time cleanup of stale demo notifications stored on the device.
try { localStorage.removeItem('realtyz_demo_notifications'); } catch { /* noop */ }

export default function NotificationCenter() {
  // Property-tour notifications exist only in workspaces that manage properties.
  const { listingsEnabled } = useWorkspaceFeatures();
  const navigate = useNavigate();
  const { user } = useAuth();
  // HARD ISOLATION: every notification query below is filtered by the ACTIVE
  // workspace, so switching workspaces never shows another workspace's items.
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const scope = workspaceOwnerId ?? user?.id ?? null;
  const [open, setOpen] = useState(false);
  // Read / deleted state lives in the database so it never resets on refresh.
  const { readKeys: viewedIds, deletedKeys, markRead, remove } = useNotificationStates();
  const [dismissedBudgets, setDismissedBudgets] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('realtyz_dismissed_budgets');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  // Budget threshold alerts: ≥80% of monthly limit per service
  const { data: budgetAlerts = [] } = useQuery({
    queryKey: ['budget-alerts', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: limits }, { data: events }] = await Promise.all([
        supabase.from('budget_limits').select('service_type, monthly_limit, hard_stop').eq('user_id', user!.id),
        supabase.from('usage_events')
          .select('service_type, total_cost')
          .eq('user_id', user!.id)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      const spendByService: Record<string, number> = {};
      (events ?? []).forEach((e: any) => {
        spendByService[e.service_type] = (spendByService[e.service_type] || 0) + Number(e.total_cost || 0);
      });
      const alerts: Array<{ service: string; limit: number; spent: number; pct: number; hardStop: boolean }> = [];
      (limits ?? []).forEach((l: any) => {
        const limit = Number(l.monthly_limit);
        if (!limit) return;
        const spent = spendByService[l.service_type] || 0;
        const pct = (spent / limit) * 100;
        if (pct >= 80) alerts.push({ service: l.service_type, limit, spent, pct: Math.round(pct), hardStop: l.hard_stop });
      });
      return alerts;
    },
    refetchInterval: 120_000,
  });

  // Flagged inbound messages (negative-sentiment keywords) — active workspace only
  const { data: alerts = [] } = useQuery({
    queryKey: ['notification-alerts', scope],
    enabled: !!scope,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_history')
        .select('id, content, created_at, lead_id, role, leads!inner(id, assigned_to)')
        .eq('role', 'user')
        .eq('leads.assigned_to', scope!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const flagged = ((data ?? []) as any[]).filter(m =>
        m.content && ALERT_KEYWORDS.some(kw => m.content!.includes(kw))
      );
      return flagged.slice(0, 20) as any[];
    },
    refetchInterval: 60_000,
  });

  const voterIds = [...new Set(alerts.map((a: any) => a.lead_id).filter(Boolean))];
  const { data: voterMap = {} } = useQuery({
    queryKey: ['notif-leads', scope, voterIds.join(',')],
    queryFn: async () => {
      if (!voterIds.length) return {};
      const { data } = await supabase
        .from('leads')
        .select('id, full_name')
        .eq('assigned_to', scope!)
        .in('id', voterIds as string[]);
      return Object.fromEntries((data ?? []).map(v => [v.id, v.full_name]));
    },
    enabled: voterIds.length > 0 && !!scope,
  });

  // ---- Inbound WhatsApp / client messages (near real-time via short polling;
  // Realtime stays disabled on `messages` for privacy) ----
  const { data: inbound = [] } = useQuery({
    queryKey: ['notif-inbound-messages', scope],
    enabled: !!scope,
    refetchInterval: 5_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, lead_id, channel, platform, sender_type, leads!inner(id, full_name, assigned_to)')
        .eq('sender_type', 'voter')
        .eq('leads.assigned_to', scope!)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: ritaSmsReplies = [] } = useQuery({
    queryKey: ['notif-rita-sms-replies', scope],
    enabled: !!scope,
    refetchInterval: 5_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('notifications')
        .select('id, lead_id, title, body, deep_link, created_at, user_id')
        .eq('user_id', scope!)
        .eq('event_type', 'rita_sms_reply')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ---- New property tour bookings (Realtime enabled on property_tours) ----
  const { data: tours = [] } = useQuery({
    queryKey: ['notif-tours', scope],
    enabled: !!scope && listingsEnabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_tours')
        .select('id, client_name, client_phone, property_title, scheduled_at, created_at, status, owner_id')
        .eq('owner_id', scope!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ---- Brand-new incoming leads (near real-time, active workspace only) ----
  const { data: newLeads = [] } = useQuery({
    queryKey: ['notif-new-leads', scope],
    enabled: !!scope,
    refetchInterval: 20_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, interest_tag, created_at')
        .eq('assigned_to', scope!)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id || !listingsEnabled) return;
    const channel = safeChannel('notif-tours-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'property_tours' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notif-tours', user.id] });
      })
      .subscribe();
    return () => { removeChannelSafe(channel); };
  }, [user?.id, queryClient, listingsEnabled]);

  // Toast policy: only a brand-new notification that arrives while the app is
  // open produces a toast, and only once ever. Everything already present on
  // mount (or older than a couple of minutes) is silently baselined.
  const TOASTED_KEY = 'realtyz_toasted_notifs';
  const FRESH_WINDOW_MS = 2 * 60 * 1000;
  const seenRef = useRef<{ ready: boolean; ids: Set<string> }>({ ready: false, ids: new Set() });
  const baselinedRef = useRef(false);
  useEffect(() => {
    if (!seenRef.current.ready) {
      let stored: string[] = [];
      try { stored = JSON.parse(localStorage.getItem(TOASTED_KEY) || '[]'); } catch { /* noop */ }
      seenRef.current = { ready: true, ids: new Set(stored) };
    }
    // Consecutive messages from the SAME contact are merged into ONE alert:
    // only the newest message of each chat toasts, with a counter for the rest.
    const inboundByLead = new Map<string, { row: any; count: number; ids: string[] }>();
    inbound.forEach((m: any) => {
      const key = String(m.lead_id ?? m.id);
      const existing = inboundByLead.get(key);
      if (!existing) inboundByLead.set(key, { row: m, count: 1, ids: [m.id] });
      else { existing.count += 1; existing.ids.push(m.id); }
    });
    const items = [
      ...[...inboundByLead.values()].map((g) => ({
        id: g.row.id,
        at: g.row.created_at,
        // Every message id of the chat is baselined, so the older ones in the
        // same burst can never produce a second toast later.
        alsoSeen: g.ids,
        msg: g.count > 1
          ? `${g.count} הודעות חדשות מ${g.row.leads?.full_name || 'איש קשר'}`
          : `הודעה חדשה מ${g.row.leads?.full_name || 'איש קשר'}`,
      })),
      ...ritaSmsReplies.map((n: any) => ({ id: `rita-${n.id}`, at: n.created_at, msg: n.title || 'ריטה השיבה ב-SMS' })),
      ...tours.map((t: any) => ({ id: t.id, at: t.created_at, msg: `סיור חדש נקבע: ${t.client_name || 'לקוח'}` })),
      ...newLeads.map((l: any) => ({ id: `lead-${l.id}`, at: l.created_at, msg: `ליד חדש נכנס: ${l.full_name || 'איש קשר חדש'}` })),
    ];
    // First pass after mount: remember everything without notifying.
    const baseline = !baselinedRef.current;
    if (items.length > 0 || inbound.length + tours.length + newLeads.length > 0) baselinedRef.current = true;

    let changed = false;
    items.forEach((i: any) => {
      if (!i.id || seenRef.current.ids.has(i.id)) return;
      seenRef.current.ids.add(i.id);
      (i.alsoSeen ?? []).forEach((extra: string) => seenRef.current.ids.add(extra));
      changed = true;
      if (baseline) return;
      const ts = i.at ? new Date(i.at).getTime() : 0;
      if (!ts || Date.now() - ts > FRESH_WINDOW_MS) return;
      toast(i.msg);
    });
    if (changed) {
      try {
        // keep the tail bounded so the key never grows without limit
        const all = [...seenRef.current.ids].slice(-300);
        seenRef.current.ids = new Set(all);
        localStorage.setItem(TOASTED_KEY, JSON.stringify(all));
      } catch { /* noop */ }
    }
  }, [inbound, ritaSmsReplies, tours, newLeads]);



  // Group inbound messages per contact: only the newest message from each
  // contact is shown, with a counter for the rest, so repeated replies from the
  // same person never flood the drawer.
  const groupedInbound = (() => {
    const byLead = new Map<string, { row: any; count: number; extraIds: string[] }>();
    inbound.forEach((m: any) => {
      const key = String(m.lead_id ?? m.id);
      const existing = byLead.get(key);
      if (!existing) {
        byLead.set(key, { row: m, count: 1, extraIds: [] });
        return;
      }
      existing.count += 1;
      // `inbound` is ordered newest first, so the first row stays as the head.
      existing.extraIds.push(m.id);
    });
    return [...byLead.values()];
  })();

  const visibleAlerts = alerts.filter((a: any) => !deletedKeys.has(a.id));
  const visibleInbound = groupedInbound.filter((g) => !deletedKeys.has(g.row.id));
  const visibleTours = tours.filter((t: any) => !deletedKeys.has(t.id));
  const visibleLeads = newLeads.filter((l: any) => !deletedKeys.has(`lead-${l.id}`));
  const visibleRitaSmsReplies = ritaSmsReplies.filter((n: any) => !deletedKeys.has(`rita-${n.id}`));

  const unviewedAlerts = visibleAlerts.filter((a: any) => !viewedIds.has(a.id));
  const unviewedInbound = visibleInbound.filter((g) => !viewedIds.has(g.row.id));
  const unviewedTours = visibleTours.filter((t: any) => !viewedIds.has(t.id));
  const unviewedLeads = visibleLeads.filter((l: any) => !viewedIds.has(`lead-${l.id}`));
  const unviewedRitaSmsReplies = visibleRitaSmsReplies.filter((n: any) => !viewedIds.has(`rita-${n.id}`));
  const activeBudgetAlerts = budgetAlerts.filter(b => !dismissedBudgets.has(`${b.service}-${new Date().getMonth()}`));
  const badgeCount =
    unviewedAlerts.length + unviewedInbound.length + unviewedTours.length + unviewedLeads.length + unviewedRitaSmsReplies.length + activeBudgetAlerts.length;

  /** Every key currently rendered in the drawer. */
  const allKeys = [
    ...visibleAlerts.map((a: any) => a.id),
    ...visibleInbound.flatMap((g) => [g.row.id, ...g.extraIds]),
    ...visibleTours.map((t: any) => t.id),
    ...visibleLeads.map((l: any) => `lead-${l.id}`),
    ...visibleRitaSmsReplies.map((n: any) => `rita-${n.id}`),
  ];

  const markViewed = (id: string) => markRead([id]);

  const dismissBudget = (service: string) => {
    const key = `${service}-${new Date().getMonth()}`;
    const next = new Set(dismissedBudgets);
    next.add(key);
    setDismissedBudgets(next);
    localStorage.setItem('realtyz_dismissed_budgets', JSON.stringify([...next]));
  };

  const markManyViewed = (ids: string[]) => markRead(ids);

  /**
   * Opens the exact conversation in the inbox and scrolls to / highlights the
   * message that triggered the notification.
   */
  const handleClick = (voterId: string | null, id: string, extraIds: string[] = []) => {
    if (!voterId) return;
    markManyViewed([id, ...extraIds]);
    setOpen(false);
    navigate(`/inbox?chat=${voterId}&message=${id}`);
  };

  const markAllRead = () => markRead(allKeys);

  const deleteOne = (keys: string[]) => remove(keys);

  const deleteAll = () => {
    remove(allKeys);
    budgetAlerts.forEach((b) => dismissBudget(b.service));
  };

  const getMatchedKeyword = (content: string) =>
    ALERT_KEYWORDS.find(kw => content.includes(kw)) || '';


  // The bell only exists while something is actually unread.
  if (badgeCount === 0 && !open) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="מרכז התראות"
          className={`relative h-9 w-9 p-0 ${badgeCount > 0 ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'}`}
        >
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <span className="absolute right-0 top-0 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="realtyz-notification-drawer w-80 p-0 overflow-hidden" align="end" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary/15">
          <h4 className="text-sm font-semibold text-primary">מרכז התראות</h4>
          <div className="flex items-center gap-1">
            {badgeCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={markAllRead}>
                סמן הכל כנקרא
              </Button>
            )}
            {allKeys.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={deleteAll}
              >
                מחק הכל
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[min(70vh,28rem)] max-h-[calc(100vh-8rem)]">
          {activeBudgetAlerts.map(b => (
            <div
              key={b.service}
              className={`px-4 py-3 border-b border-border/30 flex gap-3 items-start ${
                b.pct >= 100 ? 'bg-destructive/8' : 'bg-amber-500/8'
              }`}
            >
              <Wallet className={`h-4 w-4 mt-0.5 shrink-0 ${b.pct >= 100 ? 'text-destructive' : 'text-amber-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">
                    {b.pct >= 100 ? 'חרגת מהתקציב' : 'אזהרת תקציב'}: {SERVICE_LABELS[b.service] || b.service}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    b.pct >= 100 ? 'bg-destructive text-destructive-foreground' : 'bg-amber-500 text-white'
                  }`}>
                    {b.pct}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ₪{b.spent.toFixed(0)} מתוך ₪{b.limit.toFixed(0)} {b.hardStop && '· עצירה אוטומטית פעילה'}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2"
                    onClick={() => { setOpen(false); navigate('/subscription'); }}
                  >
                    נהל תקציב
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-muted-foreground"
                    onClick={() => dismissBudget(b.service)}
                  >
                    הסתר החודש
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {visibleLeads.map((l: any) => {
            const key = `lead-${l.id}`;
            const isUnread = !viewedIds.has(key);
            return (
              <NotifRow key={key} unread={isUnread} onDelete={() => deleteOne([key])}>
                <button
                  onClick={() => { markViewed(key); setOpen(false); navigate(`/lead-crm/${l.id}`); }}
                  className="flex min-w-0 flex-1 items-start gap-3 text-right"
                >
                  <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      ליד חדש: {l.full_name || 'איש קשר חדש'}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {l.interest_tag || 'פנייה חדשה'}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground/60">
                      {l.created_at ? formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: he }) : ''}
                    </span>
                  </span>
                </button>
              </NotifRow>
            );
          })}

          {visibleTours.map((t: any) => {
            const isUnread = !viewedIds.has(t.id);
            return (
              <NotifRow key={t.id} unread={isUnread} onDelete={() => deleteOne([t.id])}>
                <button
                  onClick={() => { markViewed(t.id); setOpen(false); navigate('/command-center'); }}
                  className="flex min-w-0 flex-1 items-start gap-3 text-right"
                >
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">סיור חדש: {t.client_name || 'לקוח'}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.property_title || 'נכס'}
                      {t.scheduled_at ? ` · ${new Date(t.scheduled_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground/60">
                      {t.created_at ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: he }) : ''}
                    </span>
                  </span>
                </button>
              </NotifRow>
            );
          })}

          {visibleInbound.map(({ row: m, count, extraIds }) => {
            const isUnread = !viewedIds.has(m.id);
            return (
              <NotifRow
                key={m.lead_id ?? m.id}
                unread={isUnread}
                onDelete={() => deleteOne([m.id, ...extraIds])}
              >
                <button
                  onClick={() => handleClick(m.lead_id, m.id, extraIds)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-right"
                >
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.leads?.full_name || 'איש קשר'}</span>
                      {count > 1 && (
                        <span className="shrink-0 rounded-full bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          {count}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{(m.content || '').slice(0, 70)}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground/60">
                      {m.created_at ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: he }) : ''}
                    </span>
                  </span>
                </button>
              </NotifRow>
            );
          })}

          {visibleRitaSmsReplies.map((n: any) => {
            const key = `rita-${n.id}`;
            return (
              <NotifRow key={key} unread={!viewedIds.has(key)} onDelete={() => deleteOne([key])}>
                <button
                  onClick={() => { markViewed(key); setOpen(false); navigate(n.deep_link || `/inbox?chat=${n.lead_id}`); }}
                  className="flex min-w-0 flex-1 items-start gap-3 text-right"
                >
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.title || 'ריטה השיבה ב-SMS'}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground/60">
                      {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: he }) : ''}
                    </span>
                  </span>
                </button>
              </NotifRow>
            );
          })}

          {visibleAlerts.map((a: any) => {
            const isUnread = !viewedIds.has(a.id);
            const keyword = a.content ? getMatchedKeyword(a.content) : '';
            return (
              <NotifRow key={a.id} unread={isUnread} onDelete={() => deleteOne([a.id])}>
                <button
                  onClick={() => handleClick(a.lead_id, a.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-right"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{voterMap[a.lead_id ?? ''] || 'איש קשר'}</span>
                      {keyword && (
                        <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                          {keyword}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {a.content?.slice(0, 60)}...
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground/60">
                      {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: he }) : ''}
                    </span>
                  </span>
                </button>
              </NotifRow>
            );
          })}

          {allKeys.length === 0 && activeBudgetAlerts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">אין התראות</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One notification row: a clickable body plus an always-available trash button
 * that removes just this notification (persisted in the database).
 */
function NotifRow({
  unread,
  onDelete,
  children,
}: {
  unread: boolean;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-1 border-b border-border/30 px-3 py-3 transition-colors hover:bg-muted/50 ${
        unread ? 'bg-primary/5' : ''
      }`}
    >
      {children}
      <Button
        variant="ghost"
        size="icon"
        aria-label="מחיקת ההתראה"
        onClick={onDelete}
        className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
