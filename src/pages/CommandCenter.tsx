import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlarmClock,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ClipboardList,
  Hourglass,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import {
  useCommandCenterMetrics,
  useCommandCenterTasks,
  ACTION_TYPE_LABEL,
  TASK_STATUS_LABEL,
  type CommandTask,
} from '@/hooks/useCommandCenter';

const PRIORITY_STYLE: Record<CommandTask['priority'], string> = {
  high: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
  medium: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  low: 'bg-muted text-muted-foreground ring-1 ring-border',
};

const PRIORITY_LABEL: Record<CommandTask['priority'], string> = {
  high: 'דחוף',
  medium: 'רגיל',
  low: 'נמוך',
};

function dueLabel(dueAt: string | null) {
  if (!dueAt) return { text: 'ללא תאריך', overdue: false, today: false };
  const d = new Date(dueAt);
  const now = new Date();
  const overdue = d.getTime() < now.getTime();
  const today = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  return {
    text: today ? `היום ${time}` : `${date} ${time}`,
    overdue,
    today,
  };
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useCommandCenterTasks();
  const { data: metrics } = useCommandCenterMetrics();
  const [filter, setFilter] = useState<'today' | 'overdue' | 'all'>('today');

  const counts = useMemo(() => {
    const now = Date.now();
    const overdue = tasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now).length;
    const today = tasks.filter((t) => {
      if (!t.dueAt) return true;
      const d = new Date(t.dueAt);
      return d.getTime() < now || d.toDateString() === new Date().toDateString();
    }).length;
    return { overdue, today, all: tasks.length };
  }, [tasks]);

  const visible = useMemo(() => {
    const now = Date.now();
    if (filter === 'all') return tasks;
    if (filter === 'overdue') return tasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now);
    return tasks.filter((t) => {
      if (!t.dueAt) return true;
      const d = new Date(t.dueAt);
      return d.getTime() < now || d.toDateString() === new Date().toDateString();
    });
  }, [tasks, filter]);

  const completeTask = async (task: CommandTask) => {
    if (task.source !== 'task') {
      toast.info('פגישות מתעדכנות מלוח הפגישות');
      return;
    }
    const { error } = await (supabase as any)
      .from('scheduled_items')
      .update({ status: 'completed' })
      .eq('id', task.id);
    if (error) {
      toast.error('לא הצלחנו לעדכן את המשימה');
      return;
    }
    toast.success('המשימה סומנה כבוצעה');
    qc.invalidateQueries({ queryKey: ['command-center-tasks'] });
  };

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">חדר בקרה · משימות היום</h1>
        <p className="text-sm text-muted-foreground">
          כל המעקבים, השיחות והפגישות שממתינים לך, לפי דחיפות ותאריך יעד.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<AlarmClock className="h-5 w-5 text-destructive" />}
          label="משימות באיחור"
          value={counts.overdue}
          onClick={() => setFilter('overdue')}
        />
        <MetricCard
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          label="לקוחות פעילים"
          value={metrics?.activeLeads}
          onClick={() => navigate('/lead-crm')}
        />
        <MetricCard
          icon={<Building2 className="h-5 w-5 text-amber-500" />}
          label="נכסים בשיווק"
          value={metrics?.marketedListings}
          onClick={() => navigate('/properties')}
        />
        <MetricCard
          icon={<Hourglass className="h-5 w-5 text-cyan-600" />}
          label="ממתינים לתשובת לקוח"
          value={metrics?.awaitingClientReply}
          onClick={() => navigate('/inbox')}
        />
      </section>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">רשימת המשימות</h2>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="today">היום ({counts.today})</TabsTrigger>
              <TabsTrigger value="overdue">באיחור ({counts.overdue})</TabsTrigger>
              <TabsTrigger value="all">הכל ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            אין משימות פתוחות בתצוגה הזו. יום נקי.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((task) => {
              const due = dueLabel(task.dueAt);
              return (
                <li
                  key={`${task.source}-${task.id}`}
                  className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[13px] font-semibold ${PRIORITY_STYLE[task.priority]}`}>
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                        <span className="break-words text-base font-semibold">{task.title}</span>
                        {task.actionType && (
                          <Badge variant="secondary" className="text-[13px]">
                            {ACTION_TYPE_LABEL[task.actionType] ?? task.actionType}
                          </Badge>
                        )}
                        {TASK_STATUS_LABEL[task.status] && (
                          <Badge variant="outline" className="text-[13px]">
                            {TASK_STATUS_LABEL[task.status]}
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            due.overdue ? 'font-semibold text-destructive' : due.today ? 'font-semibold text-primary' : ''
                          }`}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          {due.overdue ? `באיחור · ${due.text}` : due.text}
                        </span>
                        {task.leadPhone && <span>{formatPhoneDisplay(task.leadPhone)}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {task.leadId && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-9 gap-1 text-sm"
                          onClick={() => navigate(`/lead-crm/${task.leadId}`)}
                        >
                          <Users className="h-4 w-4" />
                          {task.leadName ?? 'כרטיס לקוח'}
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      )}
                      {task.listingId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1 text-sm"
                          onClick={() => navigate(`/properties/${task.listingId}`)}
                        >
                          <Building2 className="h-4 w-4" />
                          {task.listingLabel ?? 'כרטיס נכס'}
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 gap-1 text-sm"
                        onClick={() => completeTask(task)}
                      >
                        <Check className="h-4 w-4" />
                        בוצע
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-right transition-colors hover:bg-accent/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight">
          {value === undefined ? '—' : value}
        </span>
        <span className="block text-sm text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}
