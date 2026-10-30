import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import TaskFormDialog, { toLocalDateTime } from './TaskFormDialog';
import { toast } from 'sonner';
import { PERSONAL_TASK_TYPES, personalTaskMatches, type PersonalTask, type PersonalTaskTab } from '@/lib/personalTasks';

const TABS: { value: PersonalTaskTab; label: string }[] = [
  { value: 'active', label: 'מטלות' }, { value: 'today', label: 'היום' },
  { value: 'follow_up', label: 'מעקבים' }, { value: 'completed', label: 'הושלמו' },
];
export default function PersonalTasks() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  return <PersonalTaskContent key={`${user?.id}:${owner}`} />;
}
function PersonalTaskContent() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const [tab, setTab] = useState<PersonalTaskTab>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalTask | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['personal-tasks', user?.id, owner], enabled: !!user && !!owner,
    queryFn: async () => {
      if (!user || !owner) return [];
      const { data, error } = await supabase.from('scheduled_items').select('id,title,content,scheduled_for,status,item_type,metadata').eq('workspace_owner_id', owner).eq('user_id', user.id).in('item_type', PERSONAL_TASK_TYPES).order('scheduled_for').limit(300);
      if (error) throw error;
      return (data ?? []) as PersonalTask[];
    },
    refetchInterval: 30_000,
  });
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['personal-tasks', user?.id, owner] }); };
  const add = () => { setEditing(null); setFormOpen(true); };
  const act = async (task: PersonalTask, remove = false) => {
    if (!user || !owner || busy) return;
    setBusy(task.id);
    try {
      const action = remove ? supabase.from('scheduled_items').delete() : supabase.from('scheduled_items').update({ status: personalTaskMatches(task, 'completed') ? 'pending' : 'completed' });
      const { error } = await action.eq('id', task.id).eq('workspace_owner_id', owner).eq('user_id', user.id).in('item_type', PERSONAL_TASK_TYPES);
      if (error) throw error;
      await refresh();
      toast.success(remove ? 'המטלה נמחקה' : 'המטלה עודכנה');
    } catch { toast.error('עדכון המטלה נכשל'); } finally { setBusy(null); }
  };
  const visible = (query.data ?? []).filter(task => personalTaskMatches(task, tab));
  return <section dir="rtl" className="mx-auto max-w-3xl space-y-4">
    <div className="sticky top-0 z-20 space-y-3 bg-background pb-3">
      <Tabs value={tab} onValueChange={value => setTab(value as PersonalTaskTab)}>
        <TabsList className="grid h-11 w-full grid-cols-4">
          {TABS.map(item => <TabsTrigger key={item.value} value={item.value} className="min-w-0 px-1 text-sm sm:text-base">{item.label} ({(query.data ?? []).filter(task => personalTaskMatches(task, item.value)).length})</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex justify-center"><Button onClick={add} disabled={!user || !owner} className="gap-2 bg-success text-success-foreground hover:bg-success/90"><Plus className="h-4 w-4" />{tab === 'follow_up' ? 'מעקב חדש' : 'מטלה חדשה'}</Button></div>
    </div>
    {query.isLoading ? <p role="status">טוען מטלות…</p> : query.isError ? <Button variant="outline" onClick={() => void query.refetch()}>ניסיון נוסף</Button> : visible.length === 0 ? <p className="py-8 text-center text-muted-foreground">{tab === 'completed' ? 'אין מטלות שהושלמו' : tab === 'today' ? 'אין מטלות להיום' : tab === 'follow_up' ? 'אין מעקבים כרגע' : 'אין מטלות כרגע'}</p> : <ul className="space-y-3">
      {visible.map(task => {
        const completed = personalTaskMatches(task, 'completed');
        const overdue = !completed && new Date(task.scheduled_for).getTime() < Date.now();
        return <li key={task.id} className={`rounded-lg border bg-card p-3 ${overdue ? 'border-destructive' : 'border-border'}`}>
          <Button variant="ghost" onClick={() => setExpanded(expanded === task.id ? null : task.id)} aria-expanded={expanded === task.id} className="h-auto w-full items-start justify-between gap-3 p-0 text-right hover:bg-transparent">
            <span className="min-w-0 flex-1 whitespace-normal break-words"><span className={`block text-base font-semibold ${completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</span><time className={`mt-1 block text-sm ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>{overdue ? 'באיחור · ' : ''}{new Date(task.scheduled_for).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded === task.id ? 'rotate-180' : ''}`} />
          </Button>
          <AnimatedExpansion open={expanded === task.id}><p className="mt-3 whitespace-pre-wrap break-words border-t pt-3 text-sm">{task.content}</p></AnimatedExpansion>
          <div className="mt-3 flex justify-end gap-1">
            <Button variant="ghost" size="icon" aria-label="עריכת מטלה" title="עריכת מטלה" onClick={() => { setEditing(task); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" disabled={busy === task.id} aria-label={completed ? 'פתיחה מחדש' : 'סימון כבוצע'} title={completed ? 'פתיחה מחדש' : 'סימון כבוצע'} onClick={() => void act(task)} className="text-success">{completed ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" disabled={busy === task.id} aria-label="מחיקת מטלה" title="מחיקת מטלה" onClick={() => void act(task, true)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </li>;
      })}
    </ul>}
    <TaskFormDialog personal open={formOpen} onOpenChange={setFormOpen} title={editing ? 'עריכת מטלה' : tab === 'follow_up' ? 'מעקב חדש' : 'מטלה חדשה'} submitLabel="שמירת מטלה" initial={editing ? { text: editing.content, when: toLocalDateTime(editing.scheduled_for), priority: typeof editing.metadata === 'object' && editing.metadata !== null && 'priority' in editing.metadata ? String(editing.metadata.priority) : 'medium' } : undefined} onSubmit={async values => {
      if (!user || !owner) throw new Error('לא נבחרה סביבת עבודה');
      const patch = { title: values.text.slice(0, 120), content: values.text, scheduled_for: new Date(values.when).toISOString(), metadata: { ...(typeof editing?.metadata === 'object' && editing.metadata !== null ? editing.metadata : {}), priority: values.priority } };
      const result = editing ? await supabase.from('scheduled_items').update(patch).eq('id', editing.id).eq('workspace_owner_id', owner).eq('user_id', user.id).in('item_type', PERSONAL_TASK_TYPES) : await supabase.from('scheduled_items').insert({ ...patch, user_id: user.id, workspace_owner_id: owner, item_type: tab === 'follow_up' ? 'follow_up' : 'task', channel: 'internal', status: 'pending' });
      if (result.error) throw result.error;
      await refresh(); toast.success('המטלה נשמרה');
    }} />
  </section>;
}