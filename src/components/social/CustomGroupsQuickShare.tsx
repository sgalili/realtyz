import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Copy, ExternalLink, Users, Check, Timer, Lock, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { stageActivity } from '@/lib/activityQueue';
import { Textarea } from '@/components/ui/textarea';

type CustomGroup = {
  id: string;
  group_name: string;
  group_url: string;
};

type QueuedRow = {
  id: string;
  target_ref: string | null;
  target_label: string | null;
  status: string;
  scheduled_for: string;
  payload: any;
  variations: any;
  variation_index: number | null;
};

// Canonical hardcoded footer — must match supabase/functions/_shared/owner-laws.ts
const OWNER_PHONE = '052-2973500';
const CONTACT_LINE = `לפרטים נוספים, סרטון מהנכס ותיאום ביקור פרטי, אל תהססו לפנות אליי בוואטסאפ או בטלפון ישירות: 📞 ${OWNER_PHONE}`;
const OWNER_BYLINE_LINE = 'אודי ויטמן - אנגלו סכסון, הרצליה/רמה״ש';
const OWNER_LICENSE_LINE = 'ר.מ: 3251676';

function ensureCanonicalFooter(text: string): string {
  const body = String(text ?? '').replace(/\s+$/g, '');
  if (!body) return body;
  let cleaned = body
    .replace(/\n*\s*רישיון\s*תיווך\s*מספר\s*[:：][^\n]*/gu, '')
    .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, '')
    .replace(/\n*\s*אודי\s+ויטמן\s*-\s*אנגלו[^\n]*/gu, '')
    .replace(/בהליך\s*אימות/gu, '')
    .replace(/\s+$/g, '');
  const hasContact = /052[\s\-]?297[\s\-]?3500/.test(cleaned);
  const parts: string[] = [];
  if (!hasContact) parts.push(CONTACT_LINE);
  parts.push(`${OWNER_BYLINE_LINE}\n${OWNER_LICENSE_LINE}`);
  return `${cleaned}\n\n${parts.join('\n\n')}`;
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Workspace-scoped Facebook groups directory with Time Bank queue:
 *   1. User picks a group → "Schedule" stages it into campaign_activity_queue
 *      with a 1-7 min jitter (and stacking 15-30 min spacing per slot).
 *   2. Cron (process-activity-queue) flips the row to status='ready' when its
 *      cool-down elapses.
 *   3. UI reveals the share button ONLY for the next ready row — preventing
 *      30-tab bursts that trigger Meta spam filters.
 */
export function CustomGroupsQuickShare({ body }: { body: string }) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState(false);
  const [queue, setQueue] = useState<QueuedRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [staging, setStaging] = useState(false);

  // Load groups
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!workspaceOwnerId) return;
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('custom_user_groups')
        .select('id, group_name, group_url')
        .eq('workspace_owner_id', workspaceOwnerId)
        .eq('platform', 'facebook')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setLoading(false);
      if (!error) setGroups((data ?? []) as CustomGroup[]);
    };
    load();
    return () => { cancelled = true; };
  }, [workspaceOwnerId]);

  // Poll the queue for this workspace's manual_share items
  useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await (supabase as any)
        .from('campaign_activity_queue')
        .select('id, target_ref, target_label, status, scheduled_for, payload, variations, variation_index')
        .eq('workspace_owner_id', workspaceOwnerId)
        .eq('activity_type', 'manual_share')
        .in('status', ['pending', 'ready'])
        .order('scheduled_for', { ascending: true });
      if (!cancelled) setQueue((data ?? []) as QueuedRow[]);
    };
    tick();
    const id = setInterval(tick, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => { cancelled = true; clearInterval(id); clearInterval(clock); };
  }, [workspaceOwnerId]);

  const selected = useMemo(() => groups.find((g) => g.id === selectedId) ?? null, [groups, selectedId]);

  // The single "next" unlocked row, if any
  const nextReady = useMemo(
    () => queue.find((r) => r.status === 'ready') ?? null,
    [queue],
  );
  const nextPending = useMemo(
    () => queue.find((r) => r.status === 'pending') ?? null,
    [queue],
  );

  // Editable draft for the unlocked row — initialized from payload, freely editable.
  const [draft, setDraft] = useState('');
  const [draftRowId, setDraftRowId] = useState<string | null>(null);
  useEffect(() => {
    if (!nextReady) {
      setDraft('');
      setDraftRowId(null);
      return;
    }
    if (nextReady.id === draftRowId) return;
    const title = String(nextReady.payload?.title ?? '').trim();
    const bodyText =
      String(nextReady.payload?.outbound_text ?? nextReady.payload?.body ?? '').trim() ||
      ensureCanonicalFooter((body ?? '').trim());
    const url = String(nextReady.payload?.group_url ?? '').trim();
    const composed = [title, bodyText, url ? `\n${url}` : ''].filter(Boolean).join('\n\n');
    setDraft(composed);
    setDraftRowId(nextReady.id);
  }, [nextReady, draftRowId, body]);

  if (loading || groups.length === 0) return null;


  const handleSchedule = async () => {
    if (!selected || !workspaceOwnerId) return;
    const text = ensureCanonicalFooter((body ?? '').trim());
    if (!text) {
      toast.error('אין טקסט לפרסום — חולל קודם תוכן');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setStaging(true);
    try {
      // Position this in the next slot AFTER the queued items, so spacing
      // stacks (each subsequent group lands ~18 min later + jitter).
      const slot = queue.length;
      await stageActivity({
        workspaceOwnerId,
        createdBy: user.id,
        activityType: 'manual_share',
        targetRef: selected.id,
        targetLabel: selected.group_name,
        payload: { group_url: selected.group_url, body: text },
        variations: [{ title: '', body: text }],
        slotIndex: slot,
      });
      toast.success(`"${selected.group_name}" נוסף לתור — תיפתח התראה כשמותר לפרסם`);
      setSelectedId(null);
    } catch (e: any) {
      toast.error(`שגיאה בהוספה לתור: ${e?.message ?? e}`);
    } finally {
      setStaging(false);
    }
  };

  const handleShareReady = async () => {
    if (!nextReady) return;
    const text = draft.trim();
    const url = String(nextReady.payload?.group_url ?? '');
    if (!text || !url) {
      toast.error('פרטי הקבוצה חסרים');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2500);
      toast.success('הטקסט העדכני והקישור הועתקו! הדבק בקבוצה, המתן 2 שניות לטעינת התמונות, ומחק את שורת הקישור מהטקסט למראה נקי.');
    } catch {
      toast.error('העתקה נכשלה — העתק ידנית');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    // Mark completed so the next pending row becomes the "head" of the queue.
    await (supabase as any)
      .from('campaign_activity_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        payload: { ...(nextReady.payload ?? {}), outbound_text: text, edited_by_operator: true },
      })
      .eq('id', nextReady.id);
    // Optimistic UI refresh
    setQueue((q) => q.filter((r) => r.id !== nextReady.id));
  };


  const countdownMs = nextPending
    ? new Date(nextPending.scheduled_for).getTime() - now
    : 0;

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/40 p-3 space-y-2 dark:bg-amber-950/10" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          שיתוף ידני לקבוצות פייסבוק
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300" dir="ltr">
          {groups.length}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        כדי לא להיחסם ע״י Meta — בחר קבוצה ולחץ <b>הוסף לתור</b>. המערכת תפתח אותן אחת-אחת עם מרווח של 15–30 דקות בין פרסום לפרסום.
      </p>

      {/* Group picker */}
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-background">
        {groups.map((g) => {
          const isSelected = selectedId === g.id;
          const isQueued = queue.some((r) => r.target_ref === g.id);
          return (
            <button
              key={g.id}
              type="button"
              disabled={isQueued}
              onClick={() => setSelectedId(isSelected ? null : g.id)}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-right transition',
                isQueued && 'opacity-50 cursor-not-allowed',
                isSelected ? 'bg-amber-100/70 dark:bg-amber-900/30' : !isQueued && 'hover:bg-muted/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {g.group_name}
                  {isQueued ? <span className="mr-2 text-[10px] font-normal text-amber-700">· בתור</span> : null}
                </div>
                <div className="flex items-center gap-1 truncate text-[10px] text-muted-foreground" dir="ltr">
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{g.group_url}</span>
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition',
                  isSelected ? 'border-amber-600 bg-amber-600' : 'border-muted-foreground/40',
                )}
              >
                {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Schedule action — only when something is selected */}
      {selected ? (
        <button
          type="button"
          disabled={staging}
          onClick={handleSchedule}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          <Timer className="h-4 w-4" />
          {staging ? 'מוסיף לתור…' : `הוסף "${selected.group_name}" לתור`}
        </button>
      ) : null}

      {/* Single "ready" share action — Time Bank unlocked it. Editable preview first. */}
      {nextReady ? (
        <div className="space-y-2 rounded-lg border border-emerald-400/60 bg-emerald-50/40 p-2 dark:bg-emerald-950/10">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-900 dark:text-emerald-200">
              <Pencil className="h-3.5 w-3.5" />
              ערוך לפני שיתוף: {nextReady.target_label ?? ''}
            </span>
            <span className="text-[10px] text-muted-foreground" dir="ltr">{draft.length} chars</span>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            dir="rtl"
            className="min-h-[180px] resize-y bg-background text-[13px] leading-relaxed"
            placeholder="התוכן יופיע כאן..."
          />
          <button
            type="button"
            onClick={handleShareReady}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition',
              justCopied ? 'bg-emerald-600 text-white' : 'bg-[#1877F2] text-white hover:bg-[#1668d8]',
            )}
          >
            {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {justCopied ? 'הועתק · פותח את הקבוצה' : 'העתק את הטקסט הערוך ופתח את הקבוצה'}
          </button>
        </div>
      ) : nextPending ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-300/70 bg-amber-100/50 px-3 py-2 text-[12px] font-semibold text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <Lock className="h-3.5 w-3.5" />
          הקבוצה הבאה ({nextPending.target_label}) תיפתח בעוד {fmtCountdown(countdownMs)}
        </div>
      ) : null}

    </div>
  );
}

export default CustomGroupsQuickShare;
