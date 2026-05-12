import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DEMO_CANDIDATES } from '@/lib/demoData';
import { Bell, BarChart3, CalendarClock, ExternalLink, Home, LineChart, Megaphone, Target, TrendingUp, User, Wallet } from 'lucide-react';
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
  { title: 'הזדמנות חמה בבשן', message: 'זוהה נכס בבשן 4 חדרים במחיר של 2. ה-AI יצר טיוטת מודעה ל-Meta.', cta: 'צפה בנכס', path: '/properties' },
  { title: 'סגירת עסקה קרובה', message: 'ליד חם (אלון) סיים שיחת WhatsApp עם ה-AI וביקש לתאם פגישה בבשן.', cta: 'פתח חדר עסקה', path: '/deal-room' },
  { title: 'אופטימיזציית מודעות', message: 'הקמפיין לדירת הבשן עבר אופטימיזציה: העלות לליד ירדה ב-12%.', cta: 'צפה בביצועים', path: '/campaigns' },
  { title: 'ליד חדש מהשוק', message: 'ה-AI זיהה נכס חדש ב-Yad2 התואם את פרופיל ההשבחה שלך (דירות 2 חדרים גדולות).', cta: 'צפה בנכס', path: '/properties' },
  { title: 'סיכום יום', message: '5 לידים חדשים תואמו היום לסיור בנכסים בהרצליה. ה-AI שלח תזכורות אוטומטיות.', cta: 'צפה בלידים', path: '/leads' },
  { title: 'אבן דרך לעסקה', message: 'התקרבת ליעד המכירות החודשי. נדרשת עוד עסקה אחת לסגירת המכסה.', cta: 'צפה בביצועים', path: '/business-performance' },
  { title: 'ניתוח שוק', message: 'עלייה של 5% בביקושים לשכירויות בשכונת הבשן בהרצליה. מומלץ לעדכן מחיר.', cta: 'צפה בניתוח', path: '/insights' },
];

const resolveToastPath = (notification: Pick<DemoNotification, 'title' | 'message' | 'path'>) => {
  const text = `${notification.title} ${notification.message}`;
  if (/Meta|מודעות|Ads|קמפיין|אופטימיזצי/i.test(text)) return '/campaigns';
  if (/נכס|Yad2|בשן|שכירויות|נדל"ן|דירת|דירות/i.test(text)) return '/properties';
  if (/ליד|לידים|WhatsApp|פגישה/i.test(text)) return '/leads';
  if (/עסקה|מכירות|מכסה|יעד/i.test(text)) return '/business-performance';
  if (/ניתוח|שוק|ביקוש/i.test(text)) return '/insights';
  return notification.path;
};

const isHighPriorityToast = (notification: Pick<DemoNotification, 'title' | 'message'>) =>
  /הזדמנות חמה|סגירת עסקה|אבן דרך/i.test(`${notification.title} ${notification.message}`);

const getDemoNotificationIcon = (notification: DemoNotification) => {
  const text = `${notification.title} ${notification.message} ${notification.path}`;
  if (/אופטימיזצי|מודעות|Meta|Ads|campaigns/i.test(text)) return Megaphone;
  if (/ניתוח|שוק|ביקוש|insights/i.test(text)) return LineChart;
  if (/ליד|לידים|WhatsApp|פגישה|leads/i.test(text)) return User;
  if (/אבן דרך|מכירות|מכסה|יעד|performance/i.test(text)) return Target;
  if (/סיכום יום|תזכורת|calendar/i.test(text)) return CalendarClock;
  if (/נכס|Yad2|בשן|שכירויות|דירת|דירות|properties/i.test(text)) return Home;
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
      const stored = localStorage.getItem('realtyz_demo_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
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
        const notification: DemoNotification = {
          id: `demo-${Date.now()}`,
          title: template.title,
          subtext: 'Realtyz AI · הרצליה',
          message: template.message,
          cta: template.cta,
          path: template.path,
          createdAt: new Date().toISOString(),
        };
        setDemoNotifications((current) => {
          const next = [notification, ...current].slice(0, 20);
          localStorage.setItem('realtyz_demo_notifications', JSON.stringify(next));
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
    const next = new Set([...viewedIds, ...alerts.map(a => a.id), ...demoNotifications.map(n => n.id)]);
    setViewedIds(next);
    localStorage.setItem('realtyz_viewed_notifs', JSON.stringify([...next]));
  };

  const openDemoNotification = (notification: DemoNotification) => {
    const next = new Set(viewedIds);
    next.add(notification.id);
    setViewedIds(next);
    localStorage.setItem('realtyz_viewed_notifs', JSON.stringify([...next]));
    setOpen(false);
    navigate(notification.path);
  };

  const getMatchedKeyword = (content: string) =>
    ALERT_KEYWORDS.find(kw => content.includes(kw)) || '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="מרכז התראות" className={`relative h-9 w-9 p-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground ${bellPulse ? 'realtyz-notification-pulse' : ''}`}>
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
              <div key={notification.id} className={`realtyz-notification-item px-4 py-3 border-b ${isUnread ? 'ring-1 ring-primary/20' : ''}`}>
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
