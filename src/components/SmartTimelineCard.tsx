import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Clock, Phone, MessageSquare, Home, StickyNote, Handshake, CalendarDays, Loader2,
  Sparkles, Plus, CheckCircle2, X, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  NOTE_CATEGORY_LABEL, detectNoteCategory, extractNoteAction,
  type NoteCategory, type SuggestedAction,
} from '@/lib/noteActions';

type TimelineEvent = {
  id: string;
  kind: NoteCategory | 'task' | 'system';
  label: string;
  detail: string;
  at: string;
  actor?: string | null;
};

const KIND_STYLE: Record<string, { icon: typeof Phone; cls: string }> = {
  call: { icon: Phone, cls: 'bg-blue-100 text-blue-700' },
  message: { icon: MessageSquare, cls: 'bg-emerald-100 text-emerald-700' },
  showing: { icon: Home, cls: 'bg-amber-100 text-amber-700' },
  meeting: { icon: CalendarDays, cls: 'bg-violet-100 text-violet-700' },
  offer: { icon: Handshake, cls: 'bg-rose-100 text-rose-700' },
  note: { icon: StickyNote, cls: 'bg-slate-100 text-slate-700' },
  task: { icon: CheckCircle2, cls: 'bg-sky-100 text-sky-700' },
  system: { icon: Clock, cls: 'bg-slate-100 text-slate-600' },
};

const CATEGORIES: NoteCategory[] = ['note', 'call', 'message', 'showing', 'meeting', 'offer'];

function asDate(v: any) {
  return v ? new Date(v).toISOString() : new Date().toISOString();
}

export default function SmartTimelineCard({
  leadId,
  listingId,
  title = 'ציר זמן ופעילות',
  className,
  collapsible = false,
  forceOpenKey = 0,
}: {
  leadId?: string | null;
  listingId?: string | null;
  title?: string;
  className?: string;
  collapsible?: boolean;
  forceOpenKey?: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<NoteCategory>('note');
  const [autoCategory, setAutoCategory] = useState(true);
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  const [limit, setLimit] = useState(20);
  const [noteOpen, setNoteOpen] = useState(!collapsible);
  const [timelineOpen, setTimelineOpen] = useState(!collapsible);

  useEffect(() => {
    if (collapsible && forceOpenKey > 0) {
      setNoteOpen(true);
      setTimelineOpen(true);
    }
  }, [collapsible, forceOpenKey]);

  const scopeKey = leadId ? `lead:${leadId}` : listingId ? `listing:${listingId}` : 'none';

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['smart-timeline', scopeKey],
    enabled: !!(leadId || listingId),
    staleTime: 15_000,
    queryFn: async (): Promise<TimelineEvent[]> => {
      const out: TimelineEvent[] = [];

      const activityFilter = leadId
        ? `thread_key.eq.lead:${leadId},metadata->>lead_id.eq.${leadId}`
        : `thread_key.eq.listing:${listingId},metadata->>listing_id.eq.${listingId}`;

      const [activity, msgs, meets, tours, tasks] = await Promise.all([
        (supabase as any)
          .from('interaction_activity_log')
          .select('id, action_type, platform, content, actor_label, actor_type, created_at, metadata')
          .or(activityFilter)
          .order('created_at', { ascending: false })
          .limit(80),
        leadId
          ? (supabase as any)
              .from('messages')
              .select('id, content, channel, platform, sender_type, direction, created_at')
              .eq('lead_id', leadId)
              .order('created_at', { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] }),
        leadId
          ? (supabase as any)
              .from('meetings')
              .select('id, title, description, starts_at, status, location')
              .eq('lead_id', leadId)
              .order('starts_at', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] }),
        listingId
          ? (supabase as any)
              .from('property_tours')
              .select('id, client_name, notes, scheduled_at, status')
              .eq('listing_id', listingId)
              .order('scheduled_at', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] }),
        (supabase as any)
          .from('scheduled_items')
          .select('id, title, content, status, scheduled_for, item_type, metadata')
          .or(leadId ? `metadata->>lead_id.eq.${leadId}` : `metadata->>listing_id.eq.${listingId}`)
          .order('scheduled_for', { ascending: false })
          .limit(40),
      ]);

      for (const r of (activity?.data ?? []) as any[]) {
        const meta = (r.metadata ?? {}) as any;
        const kind: any = meta.note_category
          ?? (r.action_type === 'note' ? 'note' : r.platform === 'phone' ? 'call' : r.action_type === 'interaction' ? 'message' : 'system');
        out.push({
          id: `act-${r.id}`,
          kind,
          label: r.action_type === 'note'
            ? `הערה · ${NOTE_CATEGORY_LABEL[(meta.note_category as NoteCategory) ?? 'note']}`
            : `${r.action_type === 'interaction' ? 'אינטראקציה' : 'פעילות'} · ${r.platform}`,
          detail: String(r.content ?? ''),
          at: asDate(r.created_at),
          actor: r.actor_label ?? (r.actor_type === 'ai' ? 'AI' : null),
        });
      }

      for (const r of (msgs?.data ?? []) as any[]) {
        out.push({
          id: `msg-${r.id}`,
          kind: 'message',
          label: `${r.sender_type === 'voter' || r.direction === 'inbound' ? 'הודעה מהלקוח' : 'הודעה יוצאת'} · ${r.channel ?? r.platform ?? ''}`,
          detail: String(r.content ?? ''),
          at: asDate(r.created_at),
        });
      }

      for (const r of (meets?.data ?? []) as any[]) {
        out.push({
          id: `meet-${r.id}`,
          kind: 'meeting',
          label: `פגישה · ${r.status ?? ''}`,
          detail: [r.title, r.location, r.description].filter(Boolean).join(' · '),
          at: asDate(r.starts_at),
        });
      }

      for (const r of (tours?.data ?? []) as any[]) {
        out.push({
          id: `tour-${r.id}`,
          kind: 'showing',
          label: `סיור בנכס · ${r.status ?? ''}`,
          detail: [r.client_name, r.notes].filter(Boolean).join(' · '),
          at: asDate(r.scheduled_at),
        });
      }

      for (const r of (tasks?.data ?? []) as any[]) {
        if (String(r.item_type ?? '') === 'social_post') continue;
        out.push({
          id: `task-${r.id}`,
          kind: 'task',
          label: `משימה · ${r.status ?? ''}`,
          detail: [r.title, r.content].filter(Boolean).join(' · '),
          at: asDate(r.scheduled_for),
        });
      }

      return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
  });

  const suggestion: SuggestedAction | null = useMemo(
    () => (dismissedSuggestion ? null : extractNoteAction(note)),
    [note, dismissedSuggestion],
  );

  const effectiveCategory: NoteCategory = autoCategory && note.trim() ? detectNoteCategory(note) : category;

  const saveNote = useMutation({
    mutationFn: async (opts: { createTask: boolean }) => {
      const body = note.trim();
      if (!body) throw new Error('הערה ריקה');
      const { error } = await (supabase as any).from('interaction_activity_log').insert({
        user_id: user!.id,
        thread_key: scopeKey,
        platform: 'internal',
        action_type: 'note',
        actor_type: 'human',
        actor_id: user!.id,
        actor_label: 'סוכן',
        content: body,
        metadata: {
          lead_id: leadId ?? null,
          listing_id: listingId ?? null,
          note_category: effectiveCategory,
          source: 'smart_timeline',
        },
      });
      if (error) throw error;

      if (opts.createTask && suggestion) {
        const { error: taskErr } = await (supabase as any).from('scheduled_items').insert({
          user_id: user!.id,
          title: suggestion.title,
          content: body,
          item_type: 'task',
          channel: 'internal',
          status: 'pending',
          scheduled_for: suggestion.dueAt.toISOString(),
          metadata: {
            lead_id: leadId ?? null,
            listing_id: listingId ?? null,
            action_type: 'follow_up',
            priority: 'medium',
            source: 'smart_note_extraction',
          },
        });
        if (taskErr) throw taskErr;
      }

      if (leadId) {
        await (supabase as any).from('leads').update({ last_interaction_at: new Date().toISOString() }).eq('id', leadId);
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.createTask ? 'ההערה נשמרה ונוצרה משימת מעקב' : 'ההערה נשמרה');
      setNote('');
      setDismissedSuggestion(false);
      queryClient.invalidateQueries({ queryKey: ['smart-timeline', scopeKey] });
      queryClient.invalidateQueries({ queryKey: ['command-center-tasks'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'שמירת ההערה נכשלה'),
  });

  const visible = events.slice(0, limit);

  return (
    <div className={`space-y-4 ${className ?? ''}`} dir="rtl">
      <div className={`rounded-xl border border-border bg-card p-3 ${noteOpen ? 'space-y-3' : ''}`}>
        <button type="button" className="flex w-full items-center justify-between gap-2 text-start" onClick={() => collapsible && setNoteOpen((value) => !value)} aria-expanded={noteOpen}>
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <StickyNote className="h-4 w-4 text-primary" /> הערה מהירה
          </p>
          {collapsible && <ChevronDown className={`h-4 w-4 transition-transform ${noteOpen ? 'rotate-180' : ''}`} />}
        </button>
        {noteOpen && <>
          <div className="flex items-center justify-end gap-2">
            <Select
              value={autoCategory ? 'auto' : category}
              onValueChange={(v) => {
                if (v === 'auto') { setAutoCategory(true); return; }
                setAutoCategory(false);
                setCategory(v as NoteCategory);
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs font-semibold"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">סיווג אוטומטי</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{NOTE_CATEGORY_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          </div>
        <Textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setDismissedSuggestion(false); }}
          rows={3}
          placeholder='מה קרה עכשיו? לדוגמה: "דיברתי בטלפון, לחזור אליו מחר ב-10:00"'
          className="resize-none text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[11px]">{NOTE_CATEGORY_LABEL[effectiveCategory]}</Badge>
          <span className="text-[11px] text-muted-foreground">{format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
          <Button
            size="sm"
            className="ms-auto font-bold"
            onClick={() => saveNote.mutate({ createTask: false })}
            disabled={!note.trim() || saveNote.isPending}
          >
            {saveNote.isPending ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : <Plus className="me-1.5 h-4 w-4" />}
            שמור הערה
          </Button>
        </div>

        {suggestion && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> זוהתה משימת מעקב
            </p>
            <p className="text-sm font-semibold text-foreground">{suggestion.title}</p>
            <p className="text-[11px] text-muted-foreground">
              מועד מוצע: {format(suggestion.dueAt, 'dd/MM/yyyy HH:mm')} · {suggestion.reason}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" className="text-xs font-bold" onClick={() => saveNote.mutate({ createTask: true })} disabled={saveNote.isPending}>
                שמור + צור משימה
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setDismissedSuggestion(true)}>
                <X className="me-1 h-3.5 w-3.5" /> התעלם
              </Button>
            </div>
          </div>
        )}
        </>}
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <button type="button" className={`flex w-full items-center gap-2 text-start text-sm font-semibold ${timelineOpen ? 'mb-3' : ''}`} onClick={() => collapsible && setTimelineOpen((value) => !value)} aria-expanded={timelineOpen}>
          <Clock className="h-4 w-4" /> {title}
          <Badge variant="outline" className="text-[10px] ms-auto">{events.length} אירועים</Badge>
          {collapsible && <ChevronDown className={`h-4 w-4 transition-transform ${timelineOpen ? 'rotate-180' : ''}`} />}
        </button>

        {timelineOpen && <>
        {isLoading && (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {!isLoading && events.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">אין אירועים מתועדים</p>
        )}

        <div className="space-y-0">
          {visible.map((evt, idx) => {
            const style = KIND_STYLE[evt.kind] ?? KIND_STYLE.system;
            const Icon = style.icon;
            return (
              <div key={evt.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.cls}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {idx < visible.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-xs font-semibold">{evt.label}</span>
                    {evt.actor && <span className="text-[10px] text-muted-foreground">· {evt.actor}</span>}
                    <span className="text-[10px] text-muted-foreground ms-auto">
                      {format(new Date(evt.at), 'dd/MM HH:mm')}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground line-clamp-3">{evt.detail || '—'}</p>
                </div>
        </>}
              </div>
            );
          })}
        </div>

        {events.length > limit && (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setLimit((l) => l + 30)}>
            הצג עוד {events.length - limit} אירועים
          </Button>
        )}
      </div>
    </div>
  );
}
