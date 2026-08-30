import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FirstTimeSyncDialog } from '@/components/onboarding/FirstTimeSyncDialog';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronDown,
  Pencil,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  Megaphone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import {
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

type SectionTab = 'tasks' | 'notes' | 'reminders' | 'calls' | 'posts';

const TAB_LABEL: Record<SectionTab, string> = {
  tasks: 'משימות',
  notes: 'הערות',
  reminders: 'תזכורות',
  calls: 'שיחות',
  posts: 'פוסטים',
};

/** Which section a card belongs to. */
function sectionOf(task: CommandTask): Exclude<SectionTab, 'posts'> {
  if (task.source === 'note') return task.actionType === 'interaction' ? 'calls' : 'notes';
  if (task.source === 'meeting') return 'tasks';
  if (task.actionType === 'call') return 'calls';
  if (task.actionType === 'follow_up') return 'reminders';
  return 'tasks';
}

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

const ADD_LABEL: Record<SectionTab, string> = {
  tasks: 'משימה חדשה',
  notes: 'הערה חדשה',
  reminders: 'תזכורת חדשה',
  calls: 'סיכום שיחה',
  posts: 'פוסט חדש',
};


function IconAction({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          onClick={onClick}
          className={`h-8 w-8 ${destructive ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useCommandCenterTasks();
  
  const { data: posts = [] } = useCommandCenterPosts();
  const [tab, setTab] = useState<SectionTab>('tasks');
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
    const base: Record<SectionTab, number> = { tasks: 0, notes: 0, reminders: 0, calls: 0, posts: posts.length };
    for (const t of tasks) base[sectionOf(t)] += 1;
    return base;
  }, [tasks, posts.length]);

  /** Opens the quick-action drawer on the right form for the active tab. */
  const addNew = (section: SectionTab) => {
    if (section === 'posts') {
      navigate('/campaigns');
      return;
    }
    const quickTab = section === 'notes' ? 'note' : section === 'calls' ? 'interaction' : 'reminder';
    window.dispatchEvent(new CustomEvent('open-quick-actions', { detail: { tab: quickTab } }));
  };


  const visible = useMemo(
    () => (tab === 'posts' ? [] : tasks.filter((t) => sectionOf(t) === tab)),
    [tasks, tab],
  );

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
      <FirstTimeSyncDialog />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">משימות היום</h1>
        <p className="text-sm text-muted-foreground">
          כל המעקבים, ההערות, השיחות והפרסומים שממתינים לך, לפי דחיפות ותאריך יעד.
        </p>
      </header>


      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as SectionTab)}>
            <TabsList className="justify-start overflow-x-auto">
              {(Object.keys(TAB_LABEL) as SectionTab[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {TAB_LABEL[key]} ({counts[key]})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-9 gap-1 text-sm" onClick={() => addNew(tab)}>
            <Plus className="h-4 w-4" />
            {ADD_LABEL[tab]}
          </Button>
        </div>


        {tab === 'posts' ? (
          <PostsActivityCard />
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            אין כרטיסים בתצוגה הזו.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((task) => {
              const due = task.source === 'note'
                ? { ...dueLabel(task.dueAt), overdue: false }
                : dueLabel(task.dueAt);
              const cardKey = `${task.source}-${task.id}`;
              const isOpen = openIds.has(cardKey);
              return (
                <li
                  key={cardKey}
                  className="w-full rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCard(cardKey)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-start gap-3 text-right"
                    >
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="flex flex-wrap items-center gap-2">
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
                          <span
                            className={`inline-flex items-center gap-1 text-[13px] ${
                              due.overdue
                                ? 'font-semibold text-destructive'
                                : due.today
                                  ? 'font-semibold text-primary'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            {due.overdue ? `באיחור · ${due.text}` : due.text}
                          </span>
                          {task.leadPhone && (
                            <span className="text-[13px] text-muted-foreground">{formatPhoneDisplay(task.leadPhone)}</span>
                          )}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconAction label="עריכה" onClick={() => setEditing(task)}>
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction label="מחיקה" destructive onClick={() => removeTask(task)}>
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                      <button
                        type="button"
                        onClick={() => toggleCard(cardKey)}
                        aria-label={isOpen ? 'סגירה' : 'פתיחה'}
                        className="p-1 text-muted-foreground"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                        />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                      {task.description && (
                        <p className="w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                          {task.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {task.leadId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 gap-1 text-sm"
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
                            className="h-8 gap-1 text-sm"
                            onClick={() => navigate(`/properties/${task.listingId}`)}
                          >
                            <Building2 className="h-4 w-4" />
                            {task.listingLabel ?? 'כרטיס נכס'}
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                        )}
                        {task.source !== 'note' && (
                          <IconAction label="בוצע" onClick={() => completeTask(task)}>
                            <Check className="h-4 w-4" />
                          </IconAction>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {tab === 'notes' && <PropertyNotesCard />}

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
    <div>
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
    </div>
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
                  <IconAction label="מחיקת פוסט" destructive onClick={() => onDelete(p)}>
                    <Trash2 className="h-4 w-4" />
                  </IconAction>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

