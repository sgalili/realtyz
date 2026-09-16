import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BellRing, MessageSquarePlus, Loader2, Search, CalendarCheck2 } from 'lucide-react';
import { invalidateLiveData } from '@/lib/liveSync';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import TaskFormDialog, { type TaskFormValues } from '@/components/tasks/TaskFormDialog';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';

/**
 * Quick actions are TWO standalone dialogs — a task ("משימה") and a call
 * summary ("סיכום שיחה"). The third quick flow, a property tour, lives in its
 * own `NewTourDialog`. There is no tabbed container, no note form and no
 * property-matching screen any more.
 */
type FlowKey = 'reminder' | 'interaction';

type LeadLite = { id: string; full_name: string | null; phone_number: string | null; city: string | null; deal_type: string | null };

const CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'whatsapp', label: 'וואטסאפ' },
  { value: 'phone', label: 'שיחת טלפון' },
  { value: 'email', label: 'אימייל' },
  { value: 'meeting', label: 'פגישה' },
  { value: 'facebook', label: 'פייסבוק' },
];

function localDefaultDue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateTime(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function QuickActionDrawer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [flow, setFlow] = useState<FlowKey | null>(null);
  const [saving, setSaving] = useState(false);

  // lead picker
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<LeadLite[]>([]);
  const [lead, setLead] = useState<LeadLite | null>(null);
  const [searching, setSearching] = useState(false);

  // forms
  const [taskText, setTaskText] = useState('');
  const [reminderWhen, setReminderWhen] = useState(localDefaultDue());
  const [reminderPriority, setReminderPriority] = useState('medium');
  const [interactionChannel, setInteractionChannel] = useState('whatsapp');
  const [interactionText, setInteractionText] = useState('');
  const [calendarSlots, setCalendarSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  const open = flow !== null;

  useEffect(() => {
    const openHandler = (e: Event) => {
      const requested = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      setFlow(requested === 'interaction' ? 'interaction' : 'reminder');
    };
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setFlow((v) => (v ? null : 'reminder'));
      }
    };
    window.addEventListener('open-quick-actions', openHandler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('open-quick-actions', openHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = leadQuery.trim();
    if (q.length < 2) { setLeadResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const digits = q.replace(/\D/g, '');
      const filters = [`full_name.ilike.%${q}%`];
      if (digits.length >= 3) filters.push(`phone_number.ilike.%${digits}%`);
      const { data } = await (supabase as any)
        .from('leads')
        .select('id, full_name, phone_number, city, deal_type')
        .or(filters.join(','))
        .limit(8);
      if (cancelled) return;
      setLeadResults(Array.isArray(data) ? data : []);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setSearching(false); };
  }, [leadQuery, open]);

  const threadKey = useMemo(() => (lead ? `lead:${lead.id}` : `quick:${user?.id ?? 'anon'}`), [lead, user?.id]);

  const resetAfterSave = () => {
    setTaskText('');
    setInteractionText('');
    setReminderWhen(localDefaultDue());
  };

  const loadCalendarSlots = async () => {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-availability', {
        body: { lead_id: lead?.id ?? null, duration_minutes: 30, create_booking_token: false },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'calendar_unavailable');
      const slots = Array.isArray(data.slots) ? data.slots : [];
      setCalendarSlots(slots);
      setCalendarConnected(true);
      if (slots[0]?.start) setReminderWhen(toLocalDateTime(slots[0].start));
    } catch {
      setCalendarSlots([]);
      setCalendarConnected(false);
    } finally {
      setCalendarLoading(false);
    }
  };

  async function logActivity(actionType: string, platform: string, content: string) {
    if (!user) return;
    const { error } = await (supabase as any).from('interaction_activity_log').insert({
      user_id: user.id,
      thread_key: threadKey,
      platform,
      action_type: actionType,
      actor_type: 'human',
      actor_id: user.id,
      actor_label: 'סוכן',
      content,
      metadata: {
        lead_id: lead?.id ?? null,
        source: 'quick_action_drawer',
      },
    });
    if (error) throw error;
  }

  const saveTask = async (values: TaskFormValues) => {
    const text = values.text.trim();
    const { error } = await (supabase as any).from('scheduled_items').insert({
      user_id: user!.id,
      title: text.slice(0, 120),
      content: text,
      item_type: 'task',
      channel: 'internal',
      status: 'pending',
      scheduled_for: new Date(values.when).toISOString(),
      metadata: {
        lead_id: values.lead?.id ?? null,
        lead_name: values.lead?.full_name ?? null,
        priority: values.priority,
        action_type: 'follow_up',
        source: 'quick_action_drawer',
      },
    });
    if (error) throw error;
    toast.success('המשימה נשמרה');
    setFlow(null);
    invalidateLiveData(queryClient);
    queryClient.invalidateQueries({ queryKey: ['command-center-tasks'] });
  };

  const saveInteraction = async () => {
    if (!lead) { toast.error('בחר איש קשר'); return; }
    if (!interactionText.trim()) { toast.error('כתוב סיכום שיחה'); return; }
    setSaving(true);
    try {
      await logActivity('interaction', interactionChannel, interactionText.trim());
      await (supabase as any).from('leads').update({ last_interaction_at: new Date().toISOString() }).eq('id', lead.id);
      toast.success('סיכום השיחה נשמר');
      resetAfterSave();
      setFlow(null);
      invalidateLiveData(queryClient);
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירת סיכום השיחה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const leadPicker = (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">איש קשר</Label>
      {lead ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{lead.full_name || 'ללא שם'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {lead.phone_number ? formatPhoneDisplay(lead.phone_number) : '—'}{lead.city ? ` · ${lead.city}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setLead(null); setLeadQuery(''); }}>
            החלף
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" style={{ insetInlineStart: '0.75rem' }} />
            <Input
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              placeholder="חיפוש לפי שם או טלפון"
              className="ps-9"
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">מחפש…</p>}
          {leadResults.length > 0 && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {leadResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setLead(r); setLeadResults([]); }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right transition hover:bg-accent"
                >
                  <span className="truncate text-sm font-semibold">{r.full_name || 'ללא שם'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.phone_number ? formatPhoneDisplay(r.phone_number) : ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Standalone dialog #1 — new task (same form as "עריכת משימה") */}
      <TaskFormDialog
        open={flow === 'reminder'}
        onOpenChange={(v) => setFlow(v ? 'reminder' : null)}
        title="משימה חדשה"
        submitLabel="שמור משימה"
        onSubmit={saveTask}
      />


      {/* Standalone dialog #2 — call summary */}
      <Dialog open={flow === 'interaction'} onOpenChange={(v) => setFlow(v ? 'interaction' : null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-right sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              סיכום שיחה
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {leadPicker}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">ערוץ</Label>
              <Select value={interactionChannel} onValueChange={setInteractionChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-semibold">סיכום שיחה</Label>
                <VoiceInputButton size="sm" language="auto" onTranscript={(value) => setInteractionText((current) => current ? `${current} ${value}` : value)} />
              </div>
              <Textarea
                value={interactionText}
                onChange={(e) => setInteractionText(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            <Button className="w-full font-bold" onClick={saveInteraction} disabled={saving}>
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="me-2 h-4 w-4" />}
              שמור סיכום שיחה
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
