import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Ban, Hourglass, ExternalLink, Loader2, Search, Trash2, Undo2, UserPlus, Users } from 'lucide-react';
import { GroupDiscoveryDialog } from '@/components/social/GroupDiscoveryDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectModeToggle, SelectAllRow, SelectBox } from '@/components/ui/multi-select-controls';
import { cn } from '@/lib/utils';
import { shortenName } from '@/lib/shortenName';
import { openExternal } from '@/lib/openExternal';
import { CloudGroupConnection } from '@/components/social/CloudGroupConnection';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { fbGroupUrlFrom } from '@/lib/fbGroupUrl';
import { useGroupQueueLive } from '@/hooks/useGroupQueueLive';
import { cleanGroupName, memberCountFromText } from '@/lib/fbGroupText';
import { boundedRequest } from '@/lib/boundedRequest';

type GroupTarget = { id: string; groupId: string; name: string; icon: string | null; url: string | null; members: number | null; selected: boolean; blocked?: boolean; blockedReason?: string | null; joinStatus: JoinState; pool?: string; cooldownUntil?: string | null; waitingReason?: string | null; cloudState?: string; requirements?: string[]; answers?: Record<string,string>; rulesAccepted?: boolean };
type JoinState = 'joined' | 'pending' | 'not_joined';

const bareId = (id: string) => id.replace(/^(fb:|ext:|manual:)/, '');

/** Minimum readable font size across this card. */
const TEXT_SM = 'text-[14px]';

// Compact numeric member counter: 16.1K / 2.9K / 1.2M — no surrounding text.
const formatMemberCount = (n: number): string => {
  const trim = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(n);
};

/** Square group thumbnail with a neutral placeholder when no image exists. */
function GroupThumb({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted" aria-hidden>
        <Users className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }
  return (
    <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
const TEXT_MD = 'text-[15px]';
const exactMembers = (n: number) => n.toLocaleString('he-IL');
const MAX_GROUPS = 200;
const JOIN_BATCH = 5;
const sortByPopularity = <T extends { members: number | null }>(list: T[]) =>
  [...list].sort((a, b) => (b.members ?? -1) - (a.members ?? -1));

/**
 * FacebookTargetsCard — where a broker chooses WHICH imported Facebook groups
 * the system is allowed to publish to.
 */
export function FacebookTargetsCard({ className, actions, onActiveCount }: { className?: string; actions?: ReactNode; onActiveCount?: (owner: string | null, count: number) => void }) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [allGroups, setGroups] = useState<GroupTarget[]>([]);
  // פעילות = live joined groups only; pending / not-joined / blocked live in their own tabs.
  // Active publishing pool is capped at 100 server-side (fb_rebalance_group_pool).
  const groups = allGroups.filter((g) => !g.blocked && g.joinStatus === 'joined' && g.pool === 'active');
  useEffect(() => { onActiveCount?.(workspaceOwnerId, groups.length); }, [onActiveCount, workspaceOwnerId, groups.length]);
  // בהמתנה = every non-blocked group that is not confirmed joined (not joined yet or request sent).
  const notJoinedGroups = allGroups.filter((g) => !g.blocked && g.pool === 'waiting');
  const blockedGroups = allGroups.filter((g) => g.blocked);
  const [loading, setLoading] = useState(true);
  const [deleteMode, setDeleteMode] = useState(false);
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'active' | 'not_joined' | 'blocked'>('active');
  const [joinPicked, setJoinPicked] = useState<Set<string>>(new Set());
  const [joinProgress, setJoinProgress] = useState<Record<string, string>>({});
  const [joining, setJoining] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const scopeRef = useRef(workspaceOwnerId);
  scopeRef.current = workspaceOwnerId;
  const requestRef = useRef(0);
  const loadingScopeRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Never keep another workspace's groups in local storage.
  useEffect(() => {
    setGroups([]);
    setLoading(true);
    setMarkedIds(new Set());
    setJoinPicked(new Set());
    setJoinProgress({});
    setJoining(false);
  }, [workspaceOwnerId]);


  const load = useCallback(async () => {
    if (!workspaceOwnerId) { setLoading(false); return; }
    if (loadingScopeRef.current === workspaceOwnerId) return;
    loadingScopeRef.current = workspaceOwnerId;
    const request = ++requestRef.current;
    try {
      // Release expired 24h cooldowns and refill the active pool before reading.
      try { await boundedRequest((supabase as any).rpc('fb_rebalance_group_pool', { _owner: workspaceOwnerId }), 4000); } catch { /* read anyway */ }
      const { data, error } = await boundedRequest<any>((supabase as any)
        .from('fb_user_groups')
        .select('id, group_id, group_name, group_icon, group_url, member_count, is_selected, page_id, is_blocked, blocked_reason, join_status, pool_status, cooldown_until, waiting_reason, cloud_join_state, membership_requirements, membership_answers, rules_accepted')
        // Workspace-scoped so shared Facebook groups are identical for every member.
        .eq('workspace_owner_id', workspaceOwnerId)
        .order('group_name', { ascending: true }));
      if (scopeRef.current !== workspaceOwnerId || request !== requestRef.current) return;
      if (error) throw error;
       // The authorized workspace owns the group directory, independently of
       // the current Page binding or Graph authentication state.
       const visible = (data ?? []) as any[];
      const nextGroups: GroupTarget[] = visible.map((r) => {
        const id = String(r.id);
        return ({
        id: String(r.id),
        groupId: String(r.group_id),
        name: cleanGroupName(r.group_name) || 'קבוצה ללא שם',
        icon: r.group_icon ?? null,
        url: r.group_url ?? null,
        members: typeof r.member_count === 'number' ? r.member_count : memberCountFromText(r.group_name),
        selected: r.is_selected !== false && !r.is_blocked,
        blocked: !!r.is_blocked,
        blockedReason: r.blocked_reason ?? null,
        joinStatus: (r.join_status as JoinState) ?? 'not_joined',
        pool: r.pool_status ?? 'waiting',
        cooldownUntil: r.cooldown_until ?? null,
        waitingReason: r.waiting_reason ?? null,
        cloudState: r.cloud_join_state, requirements: r.membership_requirements ?? [], answers: r.membership_answers ?? {}, rulesAccepted: r.rules_accepted,
      }); });
      setGroups(nextGroups);
      setLoadError(false);
    } catch (error) {
      if (scopeRef.current === workspaceOwnerId && request === requestRef.current) setLoadError(true);
    } finally {
      if (loadingScopeRef.current === workspaceOwnerId) loadingScopeRef.current = null;
      if (scopeRef.current === workspaceOwnerId && request === requestRef.current) setLoading(false);
    }
  }, [workspaceOwnerId]);

  useEffect(() => { void load(); }, [load]);
  useGroupQueueLive(workspaceOwnerId, () => void load());
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const toggleGroup = async (target: GroupTarget) => {
    const next = !target.selected;
    setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, selected: next } : g)));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_selected: next })
      .eq('workspace_owner_id', workspaceOwnerId)
      .eq('id', target.id);
    if (error) {
      setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, selected: !next } : g)));
      toast.error('עדכון בחירת הקבוצה נכשל', { description: error.message });
    }
  };

  const setAllGroups = async (next: boolean) => {
    const ids = groups.map((g) => g.id);
    if (ids.length === 0) return;
    setGroups((prev) => prev.map((g) => (g.blocked ? g : { ...g, selected: next })));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_selected: next })
      .eq('workspace_owner_id', workspaceOwnerId)
      .in('id', ids);
    if (error) {
      toast.error('עדכון הבחירה נכשל', { description: error.message });
      void load();
    }
  };

  const toggleMark = (id: string) => {
    setMarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markAll = (next: boolean) => setMarkedIds(next ? new Set(groups.map((g) => g.id)) : new Set());

  const deleteMarked = async () => {
    if (markedIds.size === 0 || !workspaceOwnerId) return;
    setDeleting(true);
    try {
      const ids = Array.from(markedIds);
      const { error } = await (supabase as any)
        .from('fb_user_groups')
        .delete()
        .eq('workspace_owner_id', workspaceOwnerId)
        .in('id', ids);
      if (error) throw error;
      const remaining = allGroups.filter((g) => !markedIds.has(g.id));
      setGroups(remaining);
      setMarkedIds(new Set());
      setDeleteMode(false);
      toast.success(`${ids.length} קבוצות נמחקו`);
    } catch (e: any) {
      toast.error('מחיקת הקבוצות נכשלה', { description: e?.message });
    } finally {
      setDeleting(false);
    }
  };

  const unblock = async (target: GroupTarget) => {
    setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, blocked: false, selected: true } : g)));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_blocked: false, blocked_reason: null, blocked_at: null, fail_count: 0, is_selected: true })
      .eq('workspace_owner_id', workspaceOwnerId)
      .eq('id', target.id);
    if (error) { toast.error('שחרור הקבוצה נכשל', { description: error.message }); void load(); }
    else { toast.success('הקבוצה הוחזרה לרשימה הפעילה'); void load(); }
  };

  const blockGroup = async (target: GroupTarget) => {
    setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, blocked: true, selected: false, blockedReason: 'נחסם ידנית' } : g)));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_blocked: true, blocked_reason: 'נחסם ידנית', blocked_at: new Date().toISOString(), is_selected: false })
      .eq('workspace_owner_id', workspaceOwnerId)
      .eq('id', target.id);
    if (error) { toast.error('חסימת הקבוצה נכשלה', { description: error.message }); void load(); }
    else void load();
  };


  const joinTargets = async (picked: GroupTarget[], _fromUser = false) => {
    if (!workspaceOwnerId || !picked.length || joining) return;
    setJoining(true);
    const { data, error } = await supabase.functions.invoke('fb-group-manager', { body: { action: 'retry', group_ids: picked.map(g => g.id) } });
    if (error || data?.error) toast.error('לא ניתן להתחיל הצטרפות בענן');
    else toast.success('הקבוצות הועברו לטיפול בענן');
    setJoining(false); setJoinPicked(new Set()); void load();
  };

  const saveRequirements = async (g: GroupTarget) => {
    const { error } = await supabase.from('fb_user_groups').update({ membership_answers: g.answers ?? {}, rules_accepted: g.rulesAccepted ?? false }).eq('workspace_owner_id', workspaceOwnerId).eq('id', g.id);
    if (error) toast.error('שמירת התשובות נכשלה'); else { toast.success('התשובות נשמרו לטיפול בענן'); void load(); }
  };

  const renderSimpleRow = (g: GroupTarget, extra?: ReactNode) => (
    <div key={g.id} className="flex h-11 flex-nowrap items-center gap-[11px] overflow-hidden rounded-lg border border-border/70 px-2">
      {extra}
      <GroupThumb src={g.icon} />
      <span title={g.waitingReason ? `${g.name} · ${g.waitingReason}` : g.name}
        className={cn('min-w-0 flex-1 truncate whitespace-nowrap text-right', TEXT_MD)}>
        {shortenName(g.name)}
      </span>
      {typeof g.members === 'number' && g.members > 0 && (
        <span className={cn('shrink-0 text-muted-foreground tabular-nums', TEXT_SM)} dir="ltr">{exactMembers(g.members)}</span>
      )}
      <button type="button" aria-label={`פתח את הקבוצה ${g.name} בלשונית חדשה`} title="צפה בקבוצה בלשונית חדשה"
        onClick={(e) => { e.stopPropagation(); openExternal(fbGroupUrlFrom(g.url, g.groupId)); }}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary">
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  );

  const tabBtn = (id: typeof tab, label: string, n: number) => (
    <Button key={id} variant="ghost" type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setDeleteMode(false); }}
      className={cn('flex-1 whitespace-nowrap rounded-md px-1.5 py-1 font-semibold', TEXT_SM, tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
      {n} {label}
    </Button>
  );

  return (
    <div dir="rtl" className={cn('space-y-3', className)}>
      {/* Extension/sync row — "הוספת קבוצות" sits at the card's far edge. */}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1" onClick={() => setDiscoverOpen(true)}>
          <Search className="h-3.5 w-3.5" /> הוספת קבוצות
        </Button>
        <CloudGroupConnection onRefresh={() => void load()} />{actions}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-5">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {loadError && <p role="alert" className="text-sm text-muted-foreground">לא ניתן לטעון את הקבוצות כרגע <Button variant="link" onClick={() => void load()}>ניסיון נוסף</Button></p>}
          {/* Multi-select toggle leads the tab row (RTL: right of the tabs). */}
          <div className="flex min-w-0 items-center gap-2">
            {(tab === 'not_joined' ? notJoinedGroups.length > 0 : tab === 'active' && groups.length > 0) && (
              <SelectModeToggle
                total={tab === 'not_joined' ? notJoinedGroups.length : groups.length}
                onSelectAll={() => { if (tab === 'not_joined') setJoinPicked(new Set(sortByPopularity(notJoinedGroups).slice(0, MAX_GROUPS).map(g => g.id))); else markAll(true); }}
                active={deleteMode}
                count={tab === 'not_joined' ? joinPicked.size : markedIds.size}
                onToggle={() => { setDeleteMode((v) => !v); setMarkedIds(new Set()); setJoinPicked(new Set()); }}
              />
            )}
            <div role="tablist" className="flex min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted p-0.5">
              {tabBtn('active', 'פעילות / 100', groups.length)}
              {tabBtn('not_joined', 'בהמתנה / 200', notJoinedGroups.length)}
              {tabBtn('blocked', 'חסומות', blockedGroups.length)}
            </div>
          </div>
          <GroupDiscoveryDialog
            open={discoverOpen}
            onOpenChange={setDiscoverOpen}
            blockedIds={new Set(blockedGroups.map((g) => bareId(g.groupId)))}
            knownIds={new Set(allGroups.filter((g) => !g.blocked).map((g) => bareId(g.groupId)))}
            onJoined={() => void load()}
          />
          {tab === 'not_joined' ? (
            notJoinedGroups.length === 0 ? (
              <p className={cn('text-muted-foreground', TEXT_MD)}>אין קבוצות בהמתנה.</p>
            ) : (<>
              {deleteMode && <SelectAllRow total={Math.min(notJoinedGroups.length, MAX_GROUPS)} selected={joinPicked.size}
                onToggle={() => setJoinPicked(joinPicked.size > 0 ? new Set() : new Set(sortByPopularity(notJoinedGroups).slice(0, MAX_GROUPS).map((g) => g.id)))}
                className="rounded-lg border border-border">
                <Button type="button" size="sm" className="h-7 gap-1 text-[12px]" disabled={joinPicked.size === 0 || joining}
                  onClick={() => void joinTargets(notJoinedGroups.filter((g) => joinPicked.has(g.id)), true)}>
                  {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  הצטרפות
                </Button>
              </SelectAllRow>}
              <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                {sortByPopularity(notJoinedGroups).map((g) => renderSimpleRow(g, (<>
                  {deleteMode && <SelectBox checked={joinPicked.has(g.id)} label={g.name}
                    onChange={() => setJoinPicked((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else if (n.size < MAX_GROUPS) n.add(g.id); else toast.info(`ניתן לבחור עד ${MAX_GROUPS} קבוצות`); return n; })} />}
                  {g.cloudState === 'processing' ? (
                    <Loader2 role="status" className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-label="הצטרפות בתהליך" />
                  ) : g.joinStatus === 'joined' ? <span className={cn('shrink-0 text-muted-foreground', TEXT_SM)} title={g.cooldownUntil ? 'נעילת 24 שעות לאחר פרסום' : 'ממתינה למקום בקבוצות הפעילות (עד 100)'}>{g.cooldownUntil ? `זמינה ב-${new Date(g.cooldownUntil).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'בתור'}</span>
                  : g.joinStatus === 'pending' ? <span role="status" aria-label="בקשה ממתינה לאישור" className="relative flex h-4 w-4 shrink-0 items-center justify-center"><span className="absolute inset-0 animate-ping rounded-full bg-primary/30 motion-reduce:animate-none" /><Hourglass className="relative h-3.5 w-3.5 text-primary" /></span> : <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="טרם הצטרפת" />}
                </>)))}
              </div>
              {notJoinedGroups.filter(g => g.cloudState === 'needs_answers').map(g => (
                <div key={g.id} className="space-y-2 border-t border-border pt-2">
                  <p className="text-sm font-medium">{g.name}</p>
                  {(g.requirements ?? []).map(q => <label key={q} className="block text-sm">{q}<Input value={g.answers?.[q] ?? ''} onChange={e => setGroups(prev => prev.map(x => x.id === g.id ? { ...x, answers: { ...x.answers, [q]: e.target.value } } : x))} /></label>)}
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={g.rulesAccepted} onCheckedChange={v => setGroups(prev => prev.map(x => x.id === g.id ? { ...x, rulesAccepted: v === true } : x))} />קראתי ואני מסכים לכללי הקבוצה</label>
                  <Button size="sm" onClick={() => void saveRequirements(g)}>שמירת תשובות והמשך בענן</Button>
                  <Button size="sm" variant="ghost" onClick={() => openExternal(fbGroupUrlFrom(g.url,g.groupId))}>צפייה בכללים</Button>
                </div>
              ))}
            </>)
          ) : tab === 'blocked' ? (
            blockedGroups.length === 0 ? (
              <p className={cn('text-muted-foreground', TEXT_MD)}>אין קבוצות חסומות. קבוצות שהפרסום בהן נכשל או הוגבל יופיעו כאן ולא ייבחרו בקמפיינים.</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                {blockedGroups.map((g) => (
                  <div key={g.id} className="flex flex-nowrap items-center gap-[11px] rounded-lg border border-border/70 px-2 py-1.5">
                    <Ban className="h-4 w-4 shrink-0 text-destructive" />
                    <div className={cn('min-w-0 flex-1 text-right', TEXT_MD)}>
                      <span title={g.name} className="block truncate">{shortenName(g.name)}</span>
                      {g.blockedReason && <span title={g.blockedReason} className={cn('block break-words text-muted-foreground', TEXT_SM)}>{g.blockedReason.replace(/^group_post_rejected:\s*|^group_blocked:\s*/g, '')}</span>}
                    </div>
                    <Button variant="ghost" size="sm" type="button" onClick={() => void unblock(g)} title="החזר לרשימה הפעילה"
                      className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-primary hover:bg-muted', TEXT_SM)}>
                      <Undo2 className="h-3.5 w-3.5" /> שחרור
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : (<>
          {deleteMode && (
            <SelectAllRow
              total={groups.length}
              selected={markedIds.size}
              onToggle={() => markAll(markedIds.size !== groups.length)}
              className="rounded-lg border border-border"
            >
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 gap-1 text-[12px]"
                disabled={markedIds.size === 0 || deleting}
                onClick={() => void deleteMarked()}
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                מחיקה
              </Button>
            </SelectAllRow>
          )}
          {groups.length === 0 ? (
            <p className={cn('text-muted-foreground', TEXT_MD)}>אין קבוצות פעילות. הוסף קבוצות וחבר את פייסבוק בענן.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
              {groups.map((g) => (
                <div
                  key={g.id}
                  // Single row: (multi-select checkbox) + picture + name + open-in-new-tab.
                  // The publish checkbox is intentionally absent — tap the row to toggle,
                  // and selection boxes appear only in multi-select mode.
                  className={cn(
                    'flex h-11 flex-nowrap items-center gap-[11px] overflow-hidden rounded-lg border px-2 transition-colors',
                    g.selected ? 'border-primary/40 bg-primary/5' : 'border-border/70',
                  )}
                  onClick={() => (deleteMode ? toggleMark(g.id) : void toggleGroup(g))}
                >
                  {deleteMode && (
                    <SelectBox
                      checked={markedIds.has(g.id)}
                      onChange={() => toggleMark(g.id)}
                      label={g.name}
                    />
                  )}
                  <GroupThumb src={g.icon} />
                  <span className={cn('min-w-0 flex-1 truncate whitespace-nowrap text-right', TEXT_MD)} title={g.name}>
                    {shortenName(g.name)}
                  </span>
                  {typeof g.members === 'number' && g.members > 0 && (
                    <span className={cn('shrink-0 text-muted-foreground tabular-nums', TEXT_SM)} dir="ltr">
                      {exactMembers(g.members)}
                    </span>
                  )}
                  {!deleteMode && (
                    <button type="button" aria-label={`חסימת הקבוצה ${g.name}`} title="העבר לקבוצות חסומות"
                      onClick={(e) => { e.stopPropagation(); void blockGroup(g); }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`פתח את הקבוצה ${g.name} בלשונית חדשה`}
                    title="צפה בקבוצה בלשונית חדשה"
                    onClick={(e) => {
                      e.stopPropagation();
                      openExternal(fbGroupUrlFrom(g.url, g.groupId));
                    }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          </>)}
        </div>
      )}
    </div>
  );
}

export default FacebookTargetsCard;
