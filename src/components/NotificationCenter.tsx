import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Bell, AlertTriangle, ExternalLink, Wallet, MessageCircle, CalendarClock } from 'lucide-react';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('realtyz_viewed_notifs');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });
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

  // Flagged inbound messages (negative-sentiment keywords)
  const { data: alerts = [] } = useQuery({
    queryKey: ['notification-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_history')
        .select('id, content, created_at, lead_id, role')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const flagged = (data ?? []).filter(m =>
        m.content && ALERT_KEYWORDS.some(kw => m.content!.includes(kw))
      );
      return flagged.slice(0, 20);
    },
    refetchInterval: 60_000,
  });

  const voterIds = [...new Set(alerts.map(a => a.lead_id).filter(Boolean))];
  const { data: voterMap = {} } = useQuery({
    queryKey: ['notif-leads', voterIds.join(',')],
    queryFn: async () => {
      if (!voterIds.length) return {};
      const { data } = await supabase
        .from('leads')
        .select('id, full_name')
        .in('id', voterIds as string[]);
      return Object.fromEntries((data ?? []).map(v => [v.id, v.full_name]));
    },
    enabled: voterIds.length > 0,
  });

  // ---- Inbound WhatsApp / client messages (near real-time via short polling;
  // Realtime stays disabled on `messages` for privacy) ----
  const { data: inbound = [] } = useQuery({
    queryKey: ['notif-inbound-messages', user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, lead_id, channel, platform, sender_type, leads!inner(id, full_name)')
        .eq('sender_type', 'voter')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ---- New property tour bookings (Realtime enabled on property_tours) ----
  const { data: tours = [] } = useQuery({
    queryKey: ['notif-tours', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_tours')
        .select('id, client_name, client_phone, property_title, scheduled_at, created_at, status')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const channel = safeChannel('notif-tours-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'property_tours' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notif-tours', user.id] });
      })
      .subscribe();
    return () => { removeChannelSafe(channel); };
  }, [user?.id, queryClient]);

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
    const items = [
      ...inbound.map((m: any) => ({ id: m.id, at: m.created_at, msg: `הודעה חדשה מ${m.leads?.full_name || 'מתעניין'}` })),
      ...tours.map((t: any) => ({ id: t.id, at: t.created_at, msg: `סיור חדש נקבע: ${t.client_name || 'לקוח'}` })),
    ];
    // First pass after mount: remember everything without notifying.
    const baseline = !baselinedRef.current;
    if (items.length > 0 || inbound.length + tours.length > 0) baselinedRef.current = true;

    let changed = false;
    items.forEach((i) => {
      if (!i.id || seenRef.current.ids.has(i.id)) return;
      seenRef.current.ids.add(i.id);
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
  }, [inbound, tours]);



  const unviewedAlerts = alerts.filter(a => !viewedIds.has(a.id));
  const unviewedInbound = inbound.filter((m: any) => !viewedIds.has(m.id));
  const unviewedTours = tours.filter((t: any) => !viewedIds.has(t.id));
  const activeBudgetAlerts = budgetAlerts.filter(b => !dismissedBudgets.has(`${b.service}-${new Date().getMonth()}`));
  const badgeCount = unviewedAlerts.length + unviewedInbound.length + unviewedTours.length + activeBudgetAlerts.length;

  const markViewed = (id: string) => {
    const next = new Set(viewedIds);
    next.add(id);
    setViewedIds(next);
    localStorage.setItem('realtyz_viewed_notifs', JSON.stringify([...next]));
  };

  const dismissBudget = (service: string) => {
    const key = `${service}-${new Date().getMonth()}`;
    const next = new Set(dismissedBudgets);
    next.add(key);
    setDismissedBudgets(next);
    localStorage.setItem('realtyz_dismissed_budgets', JSON.stringify([...next]));
  };

  const handleClick = (voterId: string | null, id: string) => {
    if (!voterId) return;
    markViewed(id);
    setOpen(false);
    navigate(`/live-conversations?lead=${voterId}`);
  };

  const markAllRead = () => {
    const next = new Set([
      ...viewedIds,
      ...alerts.map(a => a.id),
      ...inbound.map((m: any) => m.id),
      ...tours.map((t: any) => t.id),
    ]);
    setViewedIds(next);
    localStorage.setItem('realtyz_viewed_notifs', JSON.stringify([...next]));
  };

  const getMatchedKeyword = (content: string) =>
    ALERT_KEYWORDS.find(kw => content.includes(kw)) || '';


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

          {tours.map((t: any) => {
            const isUnread = !viewedIds.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => { markViewed(t.id); setOpen(false); navigate('/dashboard#tours'); }}
                className={`w-full text-right px-4 py-3 border-b border-border/30 hover:bg-muted/50 transition-colors flex gap-3 items-start ${isUnread ? 'bg-primary/5' : ''}`}
              >
                <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">סיור חדש: {t.client_name || 'לקוח'}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {t.property_title || 'נכס'}
                    {t.scheduled_at ? ` · ${new Date(t.scheduled_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {t.created_at ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: he }) : ''}
                  </p>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground/40 mt-1 shrink-0" />
              </button>
            );
          })}

          {inbound.map((m: any) => {
            const isUnread = !viewedIds.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => handleClick(m.lead_id, m.id)}
                className={`w-full text-right px-4 py-3 border-b border-border/30 hover:bg-muted/50 transition-colors flex gap-3 items-start ${isUnread ? 'bg-primary/5' : ''}`}
              >
                <MessageCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.leads?.full_name || 'מתעניין'}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{(m.content || '').slice(0, 70)}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {m.created_at ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: he }) : ''}
                  </p>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground/40 mt-1 shrink-0" />
              </button>
            );
          })}

          {alerts.length === 0 && activeBudgetAlerts.length === 0 && inbound.length === 0 && tours.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">אין התראות</p>
          ) : (

            alerts.map(a => {
              const isUnread = !viewedIds.has(a.id);
              const keyword = a.content ? getMatchedKeyword(a.content) : '';
              return (
                <button
                  key={a.id}
                  onClick={() => handleClick(a.lead_id, a.id)}
                  className={`w-full text-right px-4 py-3 border-b border-border/30 hover:bg-muted/50 transition-colors flex gap-3 items-start ${isUnread ? 'bg-primary/5' : ''}`}
                >
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">
                        {voterMap[a.lead_id ?? ''] || 'מתעניין'}
                      </span>
                      {keyword && (
                        <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          {keyword}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {a.content?.slice(0, 60)}...
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: he }) : ''}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/40 mt-1 shrink-0" />
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
