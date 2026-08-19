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

  const unviewedAlerts = alerts.filter(a => !viewedIds.has(a.id));
  const activeBudgetAlerts = budgetAlerts.filter(b => !dismissedBudgets.has(`${b.service}-${new Date().getMonth()}`));
  const badgeCount = unviewedAlerts.length + activeBudgetAlerts.length;

  const dismissBudget = (service: string) => {
    const key = `${service}-${new Date().getMonth()}`;
    const next = new Set(dismissedBudgets);
    next.add(key);
    setDismissedBudgets(next);
    localStorage.setItem('realtyz_dismissed_budgets', JSON.stringify([...next]));
  };

  const handleClick = (voterId: string | null, id: string) => {
    if (!voterId) return;
    const next = new Set(viewedIds);
    next.add(id);
    setViewedIds(next);
    localStorage.setItem('realtyz_viewed_notifs', JSON.stringify([...next]));
    setOpen(false);
    navigate(`/live-conversations?lead=${voterId}`);
  };

  const markAllRead = () => {
    const next = new Set([...viewedIds, ...alerts.map(a => a.id)]);
    setViewedIds(next);
    localStorage.setItem('realtyz_viewed_notifs', JSON.stringify([...next]));
  };

  const getMatchedKeyword = (content: string) =>
    ALERT_KEYWORDS.find(kw => content.includes(kw)) || '';

  // Only render the bell when there's something to notify about — keeps the
  // header clean when the user is fully caught up.
  if (badgeCount === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="מרכז התראות"
          className="relative h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-0 top-0 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="realtyz-notification-drawer w-80 p-0 overflow-hidden" align="end" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary/15">
          <h4 className="text-sm font-semibold text-primary">מרכז התראות</h4>
          <div className="flex items-center gap-1">
            {unviewedAlerts.length > 0 && (
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

          {alerts.length === 0 && activeBudgetAlerts.length === 0 ? (
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
