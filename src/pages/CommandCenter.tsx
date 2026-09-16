import { useEffect, useMemo, useState } from 'react';
import { ScheduledToursCard, useScheduledToursCount } from '@/components/dashboard/ScheduledToursCard';
import { NewTourDialog } from '@/components/dashboard/NewTourDialog';
import { NewDemoDialog } from '@/components/dashboard/NewDemoDialog';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { BrandIcon } from '@/components/BrandIcon';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FirstTimeSyncDialog } from '@/components/onboarding/FirstTimeSyncDialog';

import CallSummaryDialog from '@/components/tasks/CallSummaryDialog';
import { invalidateLiveData } from '@/lib/liveSync';
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
  Check,
  Megaphone,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import TaskFormDialog, { localDefaultDue, type TaskFormValues } from '@/components/tasks/TaskFormDialog';
import {
  useCommandCenterTasks,
  useCommandCenterPosts,
  TASK_STATUS_LABEL,
  POST_STATUS_LABEL,
  CHANNEL_LABEL,
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

/** Urgency is communicated by the card border colour instead of a label. */
const PRIORITY_BORDER: Record<CommandTask['priority'], string> = {
  high: 'border-destructive',
  medium: 'border-amber-500',
  low: 'border-border',
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
/** A call summary card lives in the activity log with action type "interaction". */
function isCallSummary(task: CommandTask): boolean {
  return task.source === 'note' && task.actionType === 'interaction';
}

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
    const callSummary = isCallSummary(task);
    return (
      <li
        key={cardKey}
        className={`w-full rounded-lg border-2 bg-card p-3 transition-colors hover:bg-accent/40 ${PRIORITY_BORDER[task.priority]}`}
      >
        <div className="min-w-0">
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleCard(cardKey)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleCard(cardKey);
              }
            }}
            aria-expanded={isOpen}
            className="flex min-w-0 cursor-pointer items-start gap-2 text-right"
          >
            {task.leadName || task.leadAvatar ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (task.leadId) navigate(`/lead-crm/${task.leadId}`);
                }}
                disabled={!task.leadId}
                aria-label={`פתיחת כרטיס איש קשר של ${task.leadName ?? 'איש קשר'}`}
              >
                <ContactAvatar name={task.leadName} imageUrl={task.leadAvatar} className="h-10 w-10 shrink-0" />
              </button>
            ) : null}
            <span className="min-w-0 flex-1">
              {task.leadName && (
                <span className="block min-w-0">
                  <span className="block min-w-0">
                    <button
                      type="button"
                      className="block max-w-full whitespace-normal break-words text-right text-[15px] font-bold leading-snug text-foreground hover:text-primary hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (task.leadId) navigate(`/lead-crm/${task.leadId}`);
                      }}
                      disabled={!task.leadId}
                    >
                      {task.leadName}
                    </button>
                    <span dir="rtl" className={`mt-0.5 block whitespace-nowrap text-[13px] ${due.overdue ? 'font-semibold text-destructive' : due.today ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                      {due.overdue ? `באיחור · ${due.text}` : due.text}
                    </span>
                    {task.listingId && listingsEnabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-auto max-w-full justify-start border-0 bg-transparent p-0 text-[13px] font-medium leading-5 text-primary shadow-none hover:bg-transparent hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/properties/${task.listingId}`, { state: { returnTo: '/command-center' } });
                        }}
                      >
                        <span className="line-clamp-2 break-normal text-right [overflow-wrap:normal]">{task.listingMeta ?? task.listingLabel ?? 'כרטיס נכס'}</span>
                      </Button>
                    )}
                  </span>
                </span>
              )}
            </span>
          </div>
          {/* Status pill + action row sit at the bottom of the card so they never cover the text */}
          <div className="mt-3 flex flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
            {TASK_STATUS_LABEL[task.status] && (
              <Badge variant="outline" className="text-[13px]">{TASK_STATUS_LABEL[task.status]}</Badge>
            )}
            <div className="flex items-center gap-2">
              {task.leadId && <IconAction label="WhatsApp" onClick={() => navigate(`/inbox?lead=${task.leadId}&channel=whatsapp`)}><BrandIcon name="whatsapp" className="h-4 w-4 text-[hsl(var(--social-whatsapp))]" /></IconAction>}
              {task.leadPhone && <Button asChild type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground"><a href={`tel:${task.leadPhone}`} aria-label="שיחת טלפון" title="שיחת טלפון"><Phone className="h-4 w-4" /></a></Button>}
              <IconAction label="עריכה" onClick={() => setEditing(task)}><Pencil className="h-4 w-4" /></IconAction>
              {task.source !== 'note' && (
                <IconAction label="בוצע" onClick={() => completeTask(task)}><Check className="h-4 w-4 text-success" /></IconAction>
              )}
              <IconAction label="מחיקה" destructive onClick={() => removeTask(task)}><Trash2 className="h-4 w-4" /></IconAction>
              <IconAction label={isOpen ? 'סגירה' : 'פתיחה'} onClick={() => toggleCard(cardKey)}>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : 'rotate-90'}`} />
              </IconAction>
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
            {task.description && (
              <p className="w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                {task.description}
              </p>
            )}
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
      <div className="mt-[-5px]">
        {/* Tabs first, then the "add new" button below them. Desktop keeps an
            exact 50px gap under the tabs; mobile stays as it was. */}
        <div className="mb-4 flex flex-col items-center justify-center gap-[25px] md:gap-0">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as SectionTab)} className="min-w-0 flex-1">
            <TabsList className="grid h-[44px] w-full gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>

              {visibleTabs.map((key) => (
                <TabsTrigger key={key} value={key} style={{ fontSize: 'calc(0.875rem + 3px)' }} className="h-9 min-w-0 rounded-lg px-2 py-2 font-semibold transition data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                  {TAB_LABEL[key]
                    ? TABS_WITHOUT_COUNT.has(key)
                      ? TAB_LABEL[key]
                      : `${TAB_LABEL[key]} (${counts[key]})`
                    : ''}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {(tab === 'tasks' || tab === 'tours') && (
            <ScheduleViewToggle view={taskView} onViewChange={setTaskView} monthCursor={taskMonth} onMonthChange={setTaskMonth} />
          )}
          </div>
          <Button size="sm" className="h-10 gap-1 bg-success text-lg font-bold text-success-foreground hover:bg-success/90 md:mt-[50px]" onClick={() => addNew(tab)}>
            <Plus className="h-4 w-4" />
            {ADD_LABEL[tab]}
          </Button>
        </div>


        {tab === 'tours' ? (
          <ScheduledToursCard view={taskView} onViewChange={setTaskView} month={taskMonth} onMonthChange={setTaskMonth} />
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
            {taskView === 'calendar' ? (
              <ScheduleMonthGrid
                items={visible.map((t) => ({
                  id: `${t.source}-${t.id}`,
                  at: t.dueAt,
                  label: t.leadName ?? t.title,
                  task: t,
                }))}
                monthCursor={taskMonth}
                onMonthChange={setTaskMonth}
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
