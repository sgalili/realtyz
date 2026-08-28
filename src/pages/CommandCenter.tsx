import { Fragment, useEffect, useMemo, useState } from 'react';
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
  ChevronDown,
  Pencil,
  StickyNote,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ClipboardList,
  Hourglass,
  Megaphone,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import {
  useCommandCenterMetrics,
  useCommandCenterTasks,
  useCommandCenterPosts,
  ACTION_TYPE_LABEL,
  TASK_STATUS_LABEL,
  POST_STATUS_LABEL,
  CHANNEL_LABEL,
  NOTE_ACTION_LABEL,
  deleteCommandTask,
  deletePostActivity,
  updateCommandTask,
  type CommandTask,
} from '@/hooks/useCommandCenter';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PropertyNotesCard } from '@/components/tasks/PropertyNotesCard';

function QuickActionsButton() {
  return (
    <Button
      type="button"
      size="lg"
      className="h-12 gap-2 px-6 text-sm font-bold"
      onClick={() => window.dispatchEvent(new Event('open-quick-actions'))}
    >
      <Zap className="h-4 w-4" />
      פעולה מהירה - פתק, תזכורת, סיכום שיחה
    </Button>
  );
}


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
  // Every card starts COLLAPSED when entering the page.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CommandTask | null>(null);
  const toggleCard = (key: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const counts = useMemo(() => {
    const now = Date.now();
    const overdue = tasks.filter((t) => t.source !== 'note' && t.dueAt && new Date(t.dueAt).getTime() < now).length;
    const today = tasks.filter((t) => {
      if (t.source === 'note') return true;
      if (!t.dueAt) return true;
      const d = new Date(t.dueAt);
      return d.getTime() < now || d.toDateString() === new Date().toDateString();
    }).length;
    return { overdue, today, all: tasks.length };
  }, [tasks]);

  const visible = useMemo(() => {
    const now = Date.now();
    if (filter === 'all') return tasks;
    if (filter === 'overdue') return tasks.filter((t) => t.source !== 'note' && t.dueAt && new Date(t.dueAt).getTime() < now);
    return tasks.filter((t) => {
      if (t.source === 'note') return true;
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

  const removeTask = async (task: CommandTask) => {
    try {
      await deleteCommandTask(task);
      toast.success('הכרטיס נמחק');
      qc.invalidateQueries({ queryKey: ['command-center-tasks'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'מחיקת הכרטיס נכשלה');
    }
  };

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">משימות היום</h1>
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
          <div className="space-y-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">אין משימות פתוחות בתצוגה הזו. יום נקי.</p>
            <QuickActionsButton />
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((task, idx) => {
              const midpoint = Math.ceil(visible.length / 2);
              const due = task.source === 'note'
                ? { ...dueLabel(task.dueAt), overdue: false }
                : dueLabel(task.dueAt);
              const cardKey = `${task.source}-${task.id}`;
              const isOpen = openIds.has(cardKey);
              return (
                <Fragment key={`${task.source}-${task.id}`}>
                {idx === midpoint && (
                  <li className="py-2 text-center">
                    <QuickActionsButton />
                  </li>
                )}
                <li

                  key={`${task.source}-${task.id}`}
                  className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => toggleCard(cardKey)}
                        aria-expanded={isOpen}
                        className="flex w-full flex-wrap items-center gap-2 text-right"
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`}
                        />
                        <span className={`rounded-full px-2 py-0.5 text-[13px] font-semibold ${PRIORITY_STYLE[task.priority]}`}>
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                        <span className="break-words text-base font-semibold">{task.title}</span>
                        {task.actionType && task.source !== 'note' && (
                          <Badge variant="secondary" className="text-[13px]">
                            {ACTION_TYPE_LABEL[task.actionType] ?? task.actionType}
                          </Badge>
                        )}
                        {task.source === 'note' && (
                          <Badge variant="outline" className="text-[13px]">
                            {NOTE_ACTION_LABEL[task.actionType ?? 'note'] ?? 'פתק'}
                          </Badge>
                        )}
                        {TASK_STATUS_LABEL[task.status] && (
                          <Badge variant="outline" className="text-[13px]">
                            {TASK_STATUS_LABEL[task.status]}
                          </Badge>
                        )}
                      </button>
                      {isOpen && task.description && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
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

                    {isOpen && (
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1 text-sm"
                        onClick={() => setEditing(task)}
                      >
                        <Pencil className="h-4 w-4" />
                        עריכה
                      </Button>
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
                      {task.source !== 'note' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 gap-1 text-sm"
                          onClick={() => completeTask(task)}
                        >
                          <Check className="h-4 w-4" />
                          בוצע
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 gap-1 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeTask(task)}
                        aria-label="מחיקה"
                      >
                        <Trash2 className="h-4 w-4" />
                        מחק
                      </Button>
                    </div>
                    )}
                  </div>
                </li>
                </Fragment>
              );

            })}
          </ul>
        )}
      </Card>

      <PropertyNotesCard />

      <PostsActivityCard />

      <EditTaskDialog
        task={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['command-center-tasks'] })}
      />
    </div>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Inline editor for any quick-action card (note, reminder, call summary, meeting). */
function EditTaskDialog({
  task,
  onClose,
  onSaved,
}: {
  task: CommandTask | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title ?? '');
    setDescription(task.description ?? '');
    setWhen(toLocalInput(task.dueAt));
  }, [task]);

  const save = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await updateCommandTask(task, {
        title: task.source === 'note' ? undefined : title.trim() || 'משימה',
        description: description.trim() || null,
        dueAt: task.source === 'note' ? undefined : when ? new Date(when).toISOString() : null,
      });
      toast.success('הכרטיס עודכן');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'עדכון הכרטיס נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>עריכת כרטיס</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {task?.source !== 'note' && (
            <div className="space-y-1.5">
              <Label htmlFor="et-title">כותרת</Label>
              <Input id="et-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="et-desc">תוכן</Label>
            <Textarea id="et-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {task?.source !== 'note' && (
            <div className="space-y-1.5">
              <Label htmlFor="et-when">מועד</Label>
              <Input id="et-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={saving}>שמירה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostsActivityCard() {
  const { data: posts = [], isLoading } = useCommandCenterPosts();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const removePost = async (post: (typeof posts)[number]) => {
    try {
      await deletePostActivity(post);
      toast.success('הפוסט נמחק');
      qc.invalidateQueries({ queryKey: ['command-center-posts'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'מחיקת הפוסט נכשלה');
    }
  };

  const scheduled = posts.filter((p) => p.scheduled);
  const past = posts.filter((p) => !p.scheduled);

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">פעילות פוסטים ופרסומים</h2>
        </div>
        <Button size="sm" variant="outline" className="h-9 gap-1 text-sm" onClick={() => navigate('/campaigns')}>
          מרכז הפוסטים
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">אין פוסטים מתוזמנים או פרסומים אחרונים.</p>
      ) : (
        <div className="space-y-5">
          {scheduled.length > 0 && (
            <PostsGroup title={`מתוזמנים (${scheduled.length})`} items={scheduled} onDelete={removePost} />
          )}
          {past.length > 0 && (
            <PostsGroup title="פורסמו לאחרונה" items={past.slice(0, 10)} onDelete={removePost} />
          )}
        </div>
      )}
    </Card>
  );
}

type PostItem = NonNullable<ReturnType<typeof useCommandCenterPosts>['data']>[number];

function PostsGroup({
  title,
  items,
  onDelete,
}: {
  title: string;
  items: PostItem[];
  onDelete: (post: PostItem) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {items.map((p) => {
          const when = p.when ? new Date(p.when) : null;
          const whenText = when
            ? `${when.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
            : 'ללא תאריך';
          return (
            <li key={p.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-base font-semibold">{p.title}</p>
                  {p.content && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.content}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.channel && (
                    <Badge variant="secondary" className="text-[13px]">
                      {CHANNEL_LABEL[p.channel] ?? p.channel}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[13px]">
                    {POST_STATUS_LABEL[p.status.toLowerCase()] ?? p.status}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {whenText}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete(p)}
                    aria-label="מחיקת פוסט"
                  >
                    <Trash2 className="h-4 w-4" />
                    מחק
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
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
