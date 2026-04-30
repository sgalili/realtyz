import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DEMO_CANDIDATES } from '@/lib/demoData';
import { Bell, AlertTriangle, CalendarClock, ExternalLink, Megaphone, ShieldAlert, Target, TrendingUp, UserCheck, Wallet } from 'lucide-react';
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

type DemoNotification = {
  id: string;
  title: string;
  subtext: string;
  message: string;
  cta: string;
  path: string;
  createdAt: string;
};

const DEMO_EVENT_TEMPLATES = [
  { title: 'הגנת משבר', message: 'זוהתה מתקפת בוטים מתואמת - מערכת ההגנה הציעה תגובת נגד.', cta: 'צפה בפרטים', path: '/sentiment' },
  { title: 'שיפור סנטימנט', message: 'עלייה בסנטימנט החיובי בקרב קהל היעד ב{city}.', cta: 'צפה בפרטים', path: '/sentiment' },
  { title: 'המרת מתלבט', message: 'ליד מתנדנד הפך לתומך לאחר שיחת AI ב-WhatsApp.', cta: 'צפה בפרטים', path: '/leads' },
  { title: 'אבן דרך לעסקה', message: 'התקרבת ליעד העסקה ה-{transaction}! נדרשים עוד 2,300 תומכים ב{region}.', cta: 'צפה בהתקדמות', path: '/dashboard' },
  { title: 'אופטימיזציית מודעות', message: 'ה-AI ביצע אופטימיזציה לקמפיין Meta: עלות לליד ירדה ב-12%.', cta: 'צפה בפרטים', path: '/campaigns' },
  { title: 'טפטוף קמפיין', message: 'רצף WhatsApp חדש תוזמן להפצה מדורגת הערב.', cta: 'צפה בפרטים', path: '/calendar' },
];

const DEMO_CITIES = ['חיפה', 'ירושלים', 'תל אביב', 'באר שבע', 'ראשון לציון'];
const DEMO_REGIONS = ['השרון', 'גוש דן', 'הצפון', 'אזור השפלה', 'ירושלים'];

const resolveToastPath = (notification: Pick<DemoNotification, 'title' | 'message' | 'path'>) => {
  const text = `${notification.title} ${notification.message}`;
  if (/Meta|מודעות|Ads|קמפיין Meta/i.test(text)) return '/campaigns';
  if (/סנטימנט|משבר|בוטים|Crisis/i.test(text)) return '/sentiment';
  if (/ליד|CRM|תומך|WhatsApp/i.test(text)) return '/leads';
  if (/טפטוף|תוזמן|Calendar|Drip/i.test(text)) return '/calendar';
  return notification.path;
};

const isHighPriorityToast = (notification: Pick<DemoNotification, 'title' | 'message'>) =>
  /משבר|בוטים|שלילי|חריגה|Critical|Crisis/i.test(`${notification.title} ${notification.message}`);

const getDemoNotificationIcon = (notification: DemoNotification) => {
  const text = `${notification.title} ${notification.message} ${notification.path}`;
  if (/משבר|בוטים|הגנה|sentiment/i.test(text)) return ShieldAlert;
  if (/סנטימנט|עלייה|שיפור/i.test(text)) return TrendingUp;
  if (/ליד|תומך|WhatsApp|voters/i.test(text)) return UserCheck;
  if (/עסקה|יעד|dashboard/i.test(text)) return Target;
  if (/מודעות|Meta|Ads|campaigns/i.test(text)) return Megaphone;
  if (/טפטוף|תוזמן|calendar/i.test(text)) return CalendarClock;
  return Bell;
};

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const activeCandidate = DEMO_CANDIDATES.find((candidate) => candidate.id === demoCandidateId) ?? DEMO_CANDIDATES[0];
  const [open, setOpen] = useState(false);
  const [bellPulse, setBellPulse] = useState(false);
  const [demoNotifications, setDemoNotifications] = useState<DemoNotification[]>(() => {
    try {
      const stored = localStorage.getItem('kalpiz_demo_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('kalpiz_viewed_notifs');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });
  const [dismissedBudgets, setDismissedBudgets] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('kalpiz_dismissed_budgets');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  const showSmartToast = (notification: DemoNotification) => {
    const toastId = notification.id;
    const path = resolveToastPath(notification);
    const highPriority = isHighPriorityToast(notification);
    let dismissTimer = window.setTimeout(() => toast.dismiss(toastId), 6000);
    let releaseTimer: number | undefined;

    const pauseDismiss = () => {
      window.clearTimeout(dismissTimer);
      if (releaseTimer) window.clearTimeout(releaseTimer);
    };

    const releaseDismiss = () => {
      releaseTimer = window.setTimeout(() => toast.dismiss(toastId), 2000);
    };

    const openNotification = () => {
      window.clearTimeout(dismissTimer);
      if (releaseTimer) window.clearTimeout(releaseTimer);
      toast.dismiss(toastId);
      navigate(path);
    };

    const dismissToast = () => {
      window.clearTimeout(dismissTimer);
      if (releaseTimer) window.clearTimeout(releaseTimer);
      toast.dismiss(toastId);
    };

    toast.custom(() => (
      <div
        dir="rtl"
        role="button"
        tabIndex={0}
        onMouseEnter={pauseDismiss}
        onMouseLeave={releaseDismiss}
        onMouseDown={pauseDismiss}
        onTouchStart={pauseDismiss}
        onTouchEnd={releaseDismiss}
        onTouchCancel={releaseDismiss}
        onClick={dismissToast}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') dismissToast(); }}
        className={`flex w-full min-w-[18rem] translate-z-0 cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 text-right shadow-lg transition-[border-color,transform] duration-150 will-change-transform hover:scale-[1.01] ${
          highPriority
            ? 'border-primary/25 bg-primary text-primary-foreground hover:border-primary/45'
            : 'border-primary/20 bg-background text-foreground hover:border-primary/35'
        }`}
      >
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{notification.message}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openNotification(); }}
          onMouseEnter={pauseDismiss}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 ${highPriority ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'}`}
        >
          {notification.cta}
        </button>
      </div>
    ), { id: toastId, duration: Infinity });
  };

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

  useEffect(() => {
    if (!isDemoMode) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeoutId = setTimeout(() => {
        const template = DEMO_EVENT_TEMPLATES[Math.floor(Math.random() * DEMO_EVENT_TEMPLATES.length)];
        const focus = activeCandidate.focus[Math.floor(Math.random() * activeCandidate.focus.length)];
        const notification: DemoNotification = {
          id: `demo-${Date.now()}`,
          title: template.title,
          subtext: `${activeCandidate.name} · ${focus}`,
          message: template.message
            .replace('{city}', DEMO_CITIES[Math.floor(Math.random() * DEMO_CITIES.length)])
            .replace('{region}', DEMO_REGIONS[Math.floor(Math.random() * DEMO_REGIONS.length)])
            .replace('{transaction}', String(activeCandidate.mandateGoal)),
          cta: template.cta,
          path: template.path,
          createdAt: new Date().toISOString(),
        };
        setDemoNotifications((current) => {
          const next = [notification, ...current].slice(0, 20);
          localStorage.setItem('kalpiz_demo_notifications', JSON.stringify(next));
          return next;
        });
        setBellPulse(true);
        window.setTimeout(() => setBellPulse(false), 2400);
        showSmartToast(notification);
        schedule();
      }, 45_000);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [activeCandidate, isDemoMode, navigate]);

  // Fetch flagged messages
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

  // Fetch lead names for flagged messages
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

  // Unread = recent messages from leads not yet viewed in inbox
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread-inbox-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('chat_history')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const unviewedAlerts = alerts.filter(a => !viewedIds.has(a.id));
  const unviewedDemoAlerts = demoNotifications.filter(n => !viewedIds.has(n.id));
  const activeBudgetAlerts = budgetAlerts.filter(b => !dismissedBudgets.has(`${b.service}-${new Date().getMonth()}`));
  const badgeCount = unviewedDemoAlerts.length + unviewedAlerts.length + activeBudgetAlerts.length || (unreadCount > 0 ? unreadCount : 0);

  const dismissBudget = (service: string) => {
    const key = `${service}-${new Date().getMonth()}`;
    const next = new Set(dismissedBudgets);
    next.add(key);
    setDismissedBudgets(next);
    localStorage.setItem('kalpiz_dismissed_budgets', JSON.stringify([...next]));
  };

  const handleClick = (voterId: string | null, id: string) => {
    if (!voterId) return;
    const next = new Set(viewedIds);
    next.add(id);
    setViewedIds(next);
    localStorage.setItem('kalpiz_viewed_notifs', JSON.stringify([...next]));
    setOpen(false);
    navigate(`/live-conversations?lead=${voterId}`);
  };

  const markAllRead = () => {
    const next = new Set([...viewedIds, ...alerts.map(a => a.id), ...demoNotifications.map(n => n.id)]);
    setViewedIds(next);
    localStorage.setItem('kalpiz_viewed_notifs', JSON.stringify([...next]));
  };

  const openDemoNotification = (notification: DemoNotification) => {
    const next = new Set(viewedIds);
    next.add(notification.id);
    setViewedIds(next);
    localStorage.setItem('kalpiz_viewed_notifs', JSON.stringify([...next]));
    setOpen(false);
    navigate(notification.path);
  };

  const getMatchedKeyword = (content: string) =>
    ALERT_KEYWORDS.find(kw => content.includes(kw)) || '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="מרכז התראות" className={`relative h-9 w-9 p-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground ${bellPulse ? 'kalpiz-notification-pulse' : ''}`}>
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <span className="absolute right-0 top-0 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="kalpiz-notification-drawer w-80 p-0 overflow-hidden" align="end" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary/15">
          <h4 className="text-sm font-semibold text-primary">מרכז התראות</h4>
          <div className="flex items-center gap-1">
          {unviewedDemoAlerts.length + unviewedAlerts.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={markAllRead}>
              סמן הכל כנקרא
            </Button>
          )}
          </div>
        </div>
        <ScrollArea className="h-[min(70vh,28rem)] max-h-[calc(100vh-8rem)]">
          {/* Budget alerts on top */}
          {demoNotifications.map((notification) => {
            const isUnread = !viewedIds.has(notification.id);
            const NotificationIcon = getDemoNotificationIcon(notification);
            return (
              <div key={notification.id} className={`kalpiz-notification-item px-4 py-3 border-b ${isUnread ? 'ring-1 ring-primary/20' : ''}`}>
                <div className="flex gap-3 items-start">
                  <NotificationIcon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-primary">{notification.title}</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: he })}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-primary/70 mt-0.5">{notification.subtext}</p>
                    <p className="text-xs text-foreground mt-1 leading-relaxed">{notification.message}</p>
                    <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={() => openDemoNotification(notification)}>
                      {notification.cta}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

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

          {alerts.length === 0 && activeBudgetAlerts.length === 0 && demoNotifications.length === 0 ? (
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
                        {voterMap[a.lead_id ?? ''] || 'ליד'}
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
