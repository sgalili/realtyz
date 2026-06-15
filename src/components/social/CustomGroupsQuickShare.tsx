import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Copy, ExternalLink, Users, Check, Timer, Lock, Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { stageActivity } from '@/lib/activityQueue';
import { Textarea } from '@/components/ui/textarea';

type CustomGroup = {
  id: string;
  group_name: string;
  group_url: string;
  last_draft_body: string | null;
};


type QueuedRow = {
  id: string;
  target_ref: string | null;
  target_label: string | null;
  status: string;
  publication_status: 'pending_time_bank' | 'ready_awaiting_whatsapp_auth' | 'published' | null;
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
 * Unified cockpit: lists workspace FB groups + their Time Bank state inline.
 *   - Idle row → checkbox to bulk-stage into campaign_activity_queue
 *   - Queued (pending) → grayed countdown badge
 *   - Ready (cooldown elapsed) → expands inline with editable textarea + copy/open
 */
export function CustomGroupsQuickShare({
  body,
  restrictToGroupIds = null,
}: {
  body: string;
  restrictToGroupIds?: string[] | null;
}) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [staging, setStaging] = useState(false);
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);


  // Load workspace's manually-curated FB groups + seed any persisted drafts.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!workspaceOwnerId) return;
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('custom_user_groups')
        .select('id, group_name, group_url, last_draft_body')
        .eq('workspace_owner_id', workspaceOwnerId)
        .eq('platform', 'facebook')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setLoading(false);
      if (!error) {
        const list = (data ?? []) as CustomGroup[];
        setGroups(list);
        setDraftById((prev) => {
          const next = { ...prev };
          for (const g of list) {
            if (next[g.id] === undefined && g.last_draft_body) {
              next[g.id] = g.last_draft_body;
            }
          }
          return next;
        });
      }
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
        .select('id, target_ref, target_label, status, publication_status, scheduled_for, payload, variations, variation_index')
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


  // Map group_id → queue row (single active row per group at a time)
  const queueByGroup = useMemo(() => {
    const m: Record<string, QueuedRow> = {};
    for (const r of queue) {
      if (r.target_ref && !m[r.target_ref]) m[r.target_ref] = r;
    }
    return m;
  }, [queue]);

  // The single "next" unlocked row, if any
  const readyRow = useMemo(() => queue.find((r) => r.status === 'ready') ?? null, [queue]);

  // Persist a draft to custom_user_groups.last_draft_body (best-effort).
  const persistDraft = async (gid: string, text: string) => {
    try {
      await (supabase as any)
        .from('custom_user_groups')
        .update({ last_draft_body: text })
        .eq('id', gid);
      setGroups((gs) => gs.map((x) => x.id === gid ? { ...x, last_draft_body: text } : x));
    } catch {
      /* non-fatal */
    }
  };

  // Compose a per-group "spun" draft from the current base body.
  // Calls the AI edge function `spin-group-post` to produce an alternative
  // phrasing, then re-applies the canonical broker footer + group URL line.
  // Falls back to the raw body if the AI call fails so we never leave the
  // textarea empty.
  const composeDraftForGroup = async (g: CustomGroup, seed?: string | number): Promise<string> => {
    const raw = (body ?? '').trim();
    if (!raw) return '';
    let spun = raw;
    try {
      const { data, error } = await (supabase as any).functions.invoke('spin-group-post', {
        body: { body: raw, group_name: g.group_name, group_url: g.group_url, seed: seed ?? Date.now() },
      });
      if (!error && data?.draft) spun = String(data.draft);
    } catch {
      /* fall back to raw body */
    }
    const withFooter = ensureCanonicalFooter(spun);
    return [withFooter, g.group_url ? `\n${g.group_url}` : ''].filter(Boolean).join('\n\n');
  };

  // Debounced save on textarea edits.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scheduleSave = (gid: string, text: string) => {
    if (saveTimers.current[gid]) clearTimeout(saveTimers.current[gid]);
    saveTimers.current[gid] = setTimeout(() => { void persistDraft(gid, text); }, 600);
  };

  // Auto-expand each ready row exactly once (so the operator sees the editor),
  // but never override the user's collapse choice afterwards.
  const autoExpandedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const r of queue) {
      if (r.status === 'ready' && r.target_ref && !autoExpandedRef.current.has(r.target_ref)) {
        autoExpandedRef.current.add(r.target_ref);
        const gid = r.target_ref;
        setExpandedIds((prev) => prev.has(gid) ? prev : new Set(prev).add(gid));
      }
    }
  }, [queue]);


  // Auto-confirm from a WhatsApp deep link: /campaigns?action=confirm&queue_id=X.
  // Declared BEFORE any early return so hook order stays stable.
  const shareReadyRef = useRef<(row?: QueuedRow) => void>(() => {});
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'confirm') return;
    const qid = params.get('queue_id');
    if (!qid) return;
    const target = queue.find((r) => r.id === qid && r.status === 'ready');
    if (!target) return;
    params.delete('action');
    params.delete('queue_id');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({}, '', next);
    setTimeout(() => { shareReadyRef.current?.(target); }, 150);
  }, [queue]);

  const visibleGroups = useMemo(() => {
    if (!restrictToGroupIds) return groups;
    const set = new Set(restrictToGroupIds);
    return groups.filter((g) => set.has(g.id));
  }, [groups, restrictToGroupIds]);

  if (loading || visibleGroups.length === 0) return null;


  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStageSelected = async () => {
    if (picked.size === 0 || !workspaceOwnerId) return;
    const text = ensureCanonicalFooter((body ?? '').trim());
    if (!text) {
      toast.error('אין טקסט לפרסום — חולל קודם תוכן');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const toStage = groups.filter((g) => picked.has(g.id) && !queueByGroup[g.id]);
    if (toStage.length === 0) {
      toast.info('כל הקבוצות שנבחרו כבר נמצאות בתור');
      setPicked(new Set());
      return;
    }
    setStaging(true);
    try {
      let baseSlot = queue.length;
      for (const g of toStage) {
        await stageActivity({
          workspaceOwnerId,
          createdBy: user.id,
          activityType: 'manual_share',
          targetRef: g.id,
          targetLabel: g.group_name,
          payload: { group_url: g.group_url, body: text },
          variations: [{ title: '', body: text }],
          slotIndex: baseSlot++,
        });
      }
      toast.success(`${toStage.length} קבוצות נוספו לתור — תיפתחנה אחת-אחת`);
      setPicked(new Set());
    } catch (e: any) {
      toast.error(`שגיאה בהוספה לתור: ${e?.message ?? e}`);
    } finally {
      setStaging(false);
    }
  };

  const handleShareReady = async (groupId?: string, rowArg?: QueuedRow) => {
    const row = rowArg ?? readyRow;
    if (!row) return;
    const gid = groupId ?? row.target_ref ?? '';
    const text = (draftById[gid] ?? '').trim() ||
      ensureCanonicalFooter([
        String(row.payload?.title ?? '').trim(),
        String(row.payload?.outbound_text ?? row.payload?.body ?? '').trim(),
      ].filter(Boolean).join('\n\n'));
    const url = String(row.payload?.group_url ?? '');
    if (!text || !url) {
      toast.error('פרטי הקבוצה חסרים');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setJustCopiedId(row.id);
      setTimeout(() => setJustCopiedId(null), 2500);
      toast.success('הטקסט והקישור הועתקו! הדבק בקבוצה, המתן 2 שניות לטעינת התמונות (Link Preview), ומחק את שורת הקישור מהטקסט למראה נקי לפני הלחיצה על פרסם.');
    } catch {
      toast.error('העתקה נכשלה — העתק ידנית');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    await (supabase as any)
      .from('campaign_activity_queue')
      .update({
        status: 'completed',
        publication_status: 'published',
        completed_at: new Date().toISOString(),
        payload: { ...(row.payload ?? {}), outbound_text: text, edited_by_operator: true },
      })
      .eq('id', row.id);
    setQueue((q) => q.filter((r) => r.id !== row.id));
    // Keep draftById[gid] — operator may want to reuse next time the group cycles.
    if (gid) void persistDraft(gid, text);
  };
  shareReadyRef.current = (row?: QueuedRow) => handleShareReady(row?.target_ref ?? undefined, row);

  const toggleExpand = (gid: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
    // First-open generator: if no draft exists for this group, spin one now.
    const g = groups.find((x) => x.id === gid);
    if (g && (draftById[gid] === undefined || draftById[gid] === '')) {
      setRegeneratingId(gid);
      void (async () => {
        try {
          const composed = await composeDraftForGroup(g);
          if (composed) {
            setDraftById((d) => ({ ...d, [gid]: composed }));
            void persistDraft(gid, composed);
          }
        } finally {
          setRegeneratingId((cur) => (cur === gid ? null : cur));
        }
      })();
    }
  };

  const handleDeleteGroup = async (g: CustomGroup, row: QueuedRow | null) => {
    if (!confirm(`למחוק את הקבוצה "${g.group_name}" מהרשימה? פעולה זו גם תבטל פוסט תור פעיל.`)) return;
    try {
      if (row) {
        await (supabase as any)
          .from('campaign_activity_queue')
          .delete()
          .eq('id', row.id);
        setQueue((q) => q.filter((r) => r.id !== row.id));
      }
      await (supabase as any)
        .from('custom_user_groups')
        .delete()
        .eq('id', g.id);
      setGroups((gs) => gs.filter((x) => x.id !== g.id));
      setPicked((p) => { const n = new Set(p); n.delete(g.id); return n; });
      setDraftById((d) => { const n = { ...d }; delete n[g.id]; return n; });
      toast.success(`הקבוצה "${g.group_name}" נמחקה`);
    } catch (e: any) {
      toast.error(`מחיקה נכשלה: ${e?.message ?? e}`);
    }
  };

  const handleRegenerate = async (g: CustomGroup, row: QueuedRow | null) => {
    if (!(body ?? '').trim()) {
      toast.error('אין תוכן זמין לחידוש — חולל קודם פוסט בסיסי');
      return;
    }
    setRegeneratingId(g.id);
    try {
      // Pass a fresh seed so the AI returns a different phrasing each click.
      const composed = await composeDraftForGroup(g, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      if (!composed) {
        toast.error('חידוש נכשל — נסה שוב');
        return;
      }
      setDraftById((d) => ({ ...d, [g.id]: composed }));
      await persistDraft(g.id, composed);
      if (row) {
        const newPayload = { ...(row.payload ?? {}), body: composed, outbound_text: composed };
        await (supabase as any)
          .from('campaign_activity_queue')
          .update({ payload: newPayload, variations: [{ title: '', body: composed }] })
          .eq('id', row.id);
        setQueue((q) => q.map((r) => r.id === row.id ? { ...r, payload: newPayload } : r));
      }
      setExpandedIds((p) => new Set(p).add(g.id));
      toast.success('נוצרה גרסה חלופית לקבוצה זו');
    } catch (e: any) {
      toast.error(`חידוש נכשל: ${e?.message ?? e}`);
    } finally {
      setRegeneratingId(null);
    }
  };





  const pickedCount = Array.from(picked).filter((id) => !queueByGroup[id]).length;


  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/40 p-3 space-y-3 dark:bg-amber-950/10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          פרסום מבוקר בקבוצות פייסבוק
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300" dir="ltr">
          {visibleGroups.length}
        </span>
      </div>

      {/* Unified group rows */}
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-background">
        {visibleGroups.map((g) => {
          const row = queueByGroup[g.id] ?? null;
          const isReady = !!row && row.status === 'ready';
          const isPending = !!row && row.status === 'pending';
          const isPicked = picked.has(g.id);
          const countdownMs = isPending ? new Date(row!.scheduled_for).getTime() - now : 0;

          const isExpanded = expandedIds.has(g.id);

          return (
            <div
              key={g.id}
              className={cn(
                'transition',
                isReady && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                isPending && 'bg-muted/40',
                !row && isPicked && 'bg-amber-100/60 dark:bg-amber-900/20',
              )}
            >
              {/* Row 1: icon · group name · status pill · refresh · delete · chevron */}
              <div className="flex items-center gap-2 px-3 py-2">
                {!row ? (
                  <button
                    type="button"
                    onClick={() => togglePick(g.id)}
                    aria-label={isPicked ? 'הסר בחירה' : 'בחר קבוצה'}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition',
                      isPicked ? 'border-amber-600 bg-amber-600' : 'border-muted-foreground/40 hover:border-amber-500',
                    )}
                  >
                    {isPicked ? <Check className="h-3 w-3 text-white" /> : null}
                  </button>
                ) : isReady ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Lock className="h-3 w-3" />
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => toggleExpand(g.id)}
                  className="min-w-0 flex-1 text-right"
                  aria-expanded={isExpanded}
                >
                  <div className="truncate text-sm font-semibold text-foreground">{g.group_name}</div>
                </button>

                {/* Status pill — inline after the group name */}
                {isReady ? (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    <Check className="h-3 w-3" />
                    ממתין לאישור
                  </span>
                ) : isPending ? (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300" dir="ltr">
                    <Timer className="h-3 w-3" />
                    {fmtCountdown(countdownMs)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    טרם פורסם
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => handleRegenerate(g, row)}
                  disabled={regeneratingId === g.id}
                  title="חדש תוכן"
                  aria-label="חדש תוכן"
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', regeneratingId === g.id && 'animate-spin')} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(g, row)}
                  title="מחק קבוצה"
                  aria-label="מחק קבוצה"
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleExpand(g.id)}
                  title={isExpanded ? 'כווץ' : 'הרחב'}
                  aria-label={isExpanded ? 'כווץ' : 'הרחב'}
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>


              {/* Collapsible body */}
              {isExpanded ? (
                <div className="border-t border-border/60">
                  <div className="flex items-center gap-1 truncate px-3 py-1.5 text-[10px] text-muted-foreground" dir="ltr">
                    <ExternalLink className="h-3 w-3" />
                    <a href={g.group_url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                      {g.group_url}
                    </a>
                  </div>

                  <div className="space-y-2 border-t border-border/40 bg-muted/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-foreground">
                        {isReady ? 'ערוך את הטקסט לפני שיתוף' : 'טיוטת הפוסט (נשמרת אוטומטית)'}
                      </span>
                      <span className="text-[10px] text-muted-foreground" dir="ltr">
                        {(draftById[g.id] ?? '').length} chars
                      </span>
                    </div>
                    <Textarea
                      value={draftById[g.id] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftById((d) => ({ ...d, [g.id]: v }));
                        scheduleSave(g.id, v);
                      }}
                      rows={9}
                      dir="rtl"
                      className="min-h-[160px] resize-y bg-background text-[13px] leading-relaxed"
                      placeholder="התוכן יופיע כאן..."
                    />
                    {isReady ? (
                      <button
                        type="button"
                        onClick={() => { void handleShareReady(g.id, row!); }}
                        className={cn(
                          'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition',
                          justCopiedId === row!.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#1877F2] text-white hover:bg-[#1668d8]',
                        )}
                      >
                        {justCopiedId === row!.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {justCopiedId === row!.id ? 'הועתק · פותח את הקבוצה' : 'העתק את הטקסט הערוך ופתח את הקבוצה'}
                      </button>
                    ) : null}
                  </div>

                </div>
              ) : null}
            </div>
          );
        })}

      </div>

      {/* Bulk stage action */}
      {pickedCount > 0 ? (
        <button
          type="button"
          disabled={staging}
          onClick={handleStageSelected}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          <Timer className="h-4 w-4" />
          {staging
            ? 'מוסיף לתור…'
            : `הוסף קבוצות נבחרות לתור (${pickedCount})`}
        </button>
      ) : null}
    </div>
  );
}

export default CustomGroupsQuickShare;
