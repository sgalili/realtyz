import { useEffect, useMemo, useState } from 'react';
import { ScheduledToursCard, useScheduledToursCount } from '@/components/dashboard/ScheduledToursCard';
import { NewTourDialog } from '@/components/dashboard/NewTourDialog';
import { NewDemoDialog } from '@/components/dashboard/NewDemoDialog';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FirstTimeSyncDialog } from '@/components/onboarding/FirstTimeSyncDialog';

import {
  ScheduleMonthGrid,
  ScheduleViewToggle,
  startOfThisMonth,
  todayKey,
  type ScheduleView,
} from '@/components/dashboard/ScheduleViews';
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
import TaskFormDialog, { localDefaultDue, type TaskFormValues } from '@/components/tasks/TaskFormDialog';
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
import {
  IncomingLeadsPanel,
  useIncomingLeadsCount,
  useScheduledDemosCount,
} from '@/components/tasks/IncomingLeadsPanel';

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

type SectionTab = 'tours' | 'tasks' | 'leads' | 'demos' | 'notes' | 'calls';

const TAB_LABEL: Record<SectionTab, string> = {
  tours: 'סיורים',
  tasks: 'משימות',
  leads: 'לידים',
  demos: 'הדגמות',
  notes: '',
  calls: 'שיחות',
};

/** Tabs that never show a card count next to their label. */
const TABS_WITHOUT_COUNT = new Set<SectionTab>([]);

/** Standard workspaces: tasks (incl. reminders) first, then tours and calls. */
const DEFAULT_TABS: SectionTab[] = ['tasks', 'tours', 'calls'];
/**
 * Rita's marketing workspace: tasks first, demos next, property tours hidden
 * (her workspace never manages properties).
 */
const RITA_TABS: SectionTab[] = ['tasks', 'demos', 'calls'];

/**
 * Which section a card belongs to. Reminders (follow-ups) live inside the
 * unified "משימות" tab — there is no separate reminders section any more.
 */
function sectionOf(task: CommandTask): SectionTab {
  if (task.source === 'note') return task.actionType === 'interaction' ? 'calls' : 'notes';
  if (task.source === 'meeting') return 'tasks';
  if (task.actionType === 'call') return 'calls';
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
  tours: 'סיור חדש',
  tasks: 'משימה חדשה',
  leads: 'איש קשר חדש',
  demos: 'הדגמה חדשה',
  notes: 'הערה חדשה',
  calls: 'סיכום שיחה',
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
  // Property card links only appear in workspaces that manage properties.
  const { listingsEnabled, isRitaWorkspace } = useWorkspaceFeatures();
  const visibleTabs = isRitaWorkspace ? RITA_TABS : DEFAULT_TABS;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useCommandCenterTasks();
  // Incoming leads and scheduled demos now live inside this page.
  const leadsCount = useIncomingLeadsCount();
  const demosCount = useScheduledDemosCount();
  const toursCount = useScheduledToursCount();
  
  const [tab, setTab] = useState<SectionTab>(visibleTabs[0]);
  // Every card starts COLLAPSED when entering the page.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Switching workspaces can change the tab set — snap back to the first tab.
  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab(visibleTabs[0]);
  }, [visibleTabs, tab]);

  const [editing, setEditing] = useState<CommandTask | null>(null);
  const [newTourOpen, setNewTourOpen] = useState(false);
  const [newDemoOpen, setNewDemoOpen] = useState(false);
  // The same list / calendar display switch the tours tab uses.
  const [taskView, setTaskView] = useState<ScheduleView>('list');
  const [taskMonth, setTaskMonth] = useState(startOfThisMonth);
  const [taskDay, setTaskDay] = useState<string | null>(() => todayKey());
  const toggleCard = (key: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const counts = useMemo(() => {
    const base: Record<SectionTab, number> = {
      tours: toursCount, tasks: 0, leads: leadsCount, demos: demosCount, notes: 0, calls: 0,
    };
    for (const t of tasks) base[sectionOf(t)] += 1;
    return base;
  }, [tasks, leadsCount, demosCount, toursCount]);

  /** Opens the quick-action drawer on the right form for the active tab. */
  const addNew = (section: SectionTab) => {
    if (section === 'demos') {
      setNewDemoOpen(true);
      return;
    }
    if (section === 'leads') {
      navigate('/lead-crm');
      return;
    }
    if (section === 'tours') {
      setNewTourOpen(true);
      return;
    }
    const quickTab = section === 'notes' ? 'note' : section === 'calls' ? 'interaction' : 'reminder';
    window.dispatchEvent(new CustomEvent('open-quick-actions', { detail: { tab: quickTab } }));
  };


  const visible = useMemo(
    () => tasks.filter((t) => sectionOf(t) === tab),
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

  /** One task card — shared by the list view and the calendar day view. */
  const renderTaskCard = (task: CommandTask) => {
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
            {task.leadName || task.leadAvatar ? (
              <ContactAvatar
                name={task.leadName}
                imageUrl={task.leadAvatar}
                className="mt-0.5 h-10 w-10 shrink-0"
              />
            ) : null}
            <span className="min-w-0 flex-1 space-y-1.5">
              {task.leadName && (
                <span className="block truncate text-[15px] font-bold text-foreground">
                  {task.leadName}
                </span>
              )}
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
              {task.listingId && listingsEnabled && (
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
  };

  return (
    <div dir="rtl" className="p-4 md:p-6">
      <FirstTimeSyncDialog />
      <NewTourDialog open={newTourOpen} onOpenChange={setNewTourOpen} />
      <NewDemoDialog open={newDemoOpen} onOpenChange={setNewDemoOpen} />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">משימות</h1>
        <p className="text-sm text-muted-foreground">
          כל המעקבים, ההערות, השיחות והפרסומים שממתינים לך, לפי דחיפות ותאריך יעד.
        </p>
      </header>

      {/* Page content sits exactly 20px below the hero header — no outer frame. */}
      <div className="mt-[20px]">
        {/* Tabs first, then the "add new" button below them. Desktop keeps an
            exact 50px gap under the tabs; mobile stays as it was. */}
        <div className="mb-4 flex flex-col items-center justify-center gap-[25px] md:gap-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as SectionTab)}>
            <TabsList className="justify-center overflow-x-auto">

              {visibleTabs.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {TAB_LABEL[key]
                    ? TABS_WITHOUT_COUNT.has(key)
                      ? TAB_LABEL[key]
                      : `${TAB_LABEL[key]} (${counts[key]})`
                    : ''}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-9 gap-1 text-sm md:mt-[50px]" onClick={() => addNew(tab)}>
            <Plus className="h-4 w-4" />
            {ADD_LABEL[tab]}
          </Button>
        </div>


        {tab === 'tours' ? (
          <ScheduledToursCard />
        ) : tab === 'leads' || tab === 'demos' ? (
          <IncomingLeadsPanel mode={tab} />

        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Same display toggle as the tours tab, fully functional here. */}
            <ScheduleViewToggle
              view={taskView}
              onViewChange={setTaskView}
              monthCursor={taskMonth}
              onMonthChange={setTaskMonth}
            />
            {taskView === 'calendar' ? (
              <ScheduleMonthGrid
                items={visible.map((t) => ({
                  id: `${t.source}-${t.id}`,
                  at: t.dueAt,
                  label: t.leadName ?? t.title,
                  task: t,
                }))}
                monthCursor={taskMonth}
                openDay={taskDay}
                onOpenDay={setTaskDay}
                emptyLabel="אין משימות ביום שנבחר"
                renderItem={(item) => (
                  <ul className="space-y-2" key={item.id}>{renderTaskCard(item.task)}</ul>
                )}
              />
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                אין כרטיסים בתצוגה הזו.
              </p>
            ) : (
              <ul className="space-y-2">
                {visible.map((task) => renderTaskCard(task))}
              </ul>
            )}
          </div>
        )}
      </div>

      {tab === 'notes' && <PropertyNotesCard />}

      {/* The edit button routes by entity type: call summaries open the call
          summary dialog, everything else opens the task form. */}
      <EditTaskDialog
        task={editing && !isCallSummary(editing) ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['command-center-tasks'] })}
      />
      <CallSummaryDialog
        logId={editing && isCallSummary(editing) ? editing.id : null}
        initialLead={
          editing?.leadId
            ? { id: editing.leadId, full_name: editing.leadName, phone_number: editing.leadPhone }
            : null
        }
        initialText={editing?.description ?? ''}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['command-center-tasks'] });
          invalidateLiveData(qc);
        }}
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

/**
 * Editing a card reuses the EXACT same form as "משימה חדשה" — identical
 * contact picker, due date with the calendar check, urgency and task text.
 */
function EditTaskDialog({
  task,
  onClose,
  onSaved,
}: {
  task: CommandTask | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = task
    ? {
        lead: task.leadId
          ? { id: task.leadId, full_name: task.leadName, phone_number: task.leadPhone }
          : null,
        when: task.dueAt ? toLocalInput(task.dueAt) : localDefaultDue(),
        priority: task.priority,
        text: task.description ?? task.title ?? '',
      }
    : undefined;

  const submit = async (values: TaskFormValues) => {
    if (!task) return;
    await updateCommandTask(task, {
      title: task.source === 'note' ? undefined : values.text.slice(0, 120) || 'משימה',
      description: values.text || null,
      dueAt: task.source === 'note' ? undefined : values.when ? new Date(values.when).toISOString() : null,
      priority: values.priority,
      leadId: values.lead?.id ?? null,
      leadName: values.lead?.full_name ?? null,
      leadPhone: values.lead?.phone_number ?? null,
    });
    toast.success('המשימה עודכנה');
    onSaved();
    onClose();
  };

  return (
    <TaskFormDialog
      open={!!task}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="עריכת משימה"
      submitLabel="שמור משימה"
      initial={initial}
      onSubmit={submit}
    />
  );
}
