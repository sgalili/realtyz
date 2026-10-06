import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Ban, Clock, ExternalLink, Loader2, Search, Trash2, Undo2, UserPlus } from 'lucide-react';
import { isExtensionInstalled } from '@/components/social/ExtensionDownloadButton';
import { joinGroupsViaExtension, type JoinStatus } from '@/lib/extensionGroupDiscovery';
import { GroupDiscoveryDialog } from '@/components/social/GroupDiscoveryDialog';
import { Button } from '@/components/ui/button';
import { SelectModeToggle, SelectAllRow, SelectBox } from '@/components/ui/multi-select-controls';
import { cn } from '@/lib/utils';
import { shortenName } from '@/lib/shortenName';
import { openExternal } from '@/lib/openExternal';
import { ExtensionGroupSyncCard } from '@/components/social/ExtensionGroupSyncCard';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { fbGroupUrlFrom } from '@/lib/fbGroupUrl';
import { useGroupQueueLive } from '@/hooks/useGroupQueueLive';

type GroupTarget = { id: string; groupId: string; name: string; icon: string | null; url: string | null; members: number | null; selected: boolean; blocked?: boolean; blockedReason?: string | null; joinStatus: JoinState };
type JoinState = 'joined' | 'pending' | 'not_joined';

const bareId = (id: string) => id.replace(/^(ext:|manual:)/, '');

/** Minimum readable font size across this card. */
const TEXT_SM = 'text-[14px]';
const TEXT_MD = 'text-[15px]';
const MAX_GROUPS = 100;
const JOIN_BATCH = 5;
const sortByPopularity = <T extends { members: number | null }>(list: T[]) =>
  [...list].sort((a, b) => (b.members ?? -1) - (a.members ?? -1));

/** Local cache so groups render instantly on the next visit. */
const CACHE_KEY_BASE = 'realtyz_fb_targets_cache';
const cacheKeyFor = (owner: string | null) => `${CACHE_KEY_BASE}:${owner ?? 'anon'}`;

/** Drop any cached group list that belongs to a different workspace. */
function purgeForeignCaches(owner: string | null) {
  try {
    const keep = cacheKeyFor(owner);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_KEY_BASE) && k !== keep) localStorage.removeItem(k);
    }
  } catch { /* noop */ }
}

function readCache(owner: string | null): { groups: GroupTarget[] } | null {
  try {
    const raw = localStorage.getItem(cacheKeyFor(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * FacebookTargetsCard — where a broker chooses WHICH imported Facebook groups
 * the system is allowed to publish to.
 */
export function FacebookTargetsCard({ className, actions, onActiveCount }: { className?: string; actions?: ReactNode; onActiveCount?: (owner: string | null, count: number) => void }) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const cached = readCache(workspaceOwnerId);
  const [allGroups, setGroups] = useState<GroupTarget[]>(cached?.groups ?? []);
  // פעילות = live joined groups only; pending / not-joined / blocked live in their own tabs.
  const groups = allGroups.filter((g) => !g.blocked && g.joinStatus === 'joined');
  useEffect(() => { onActiveCount?.(workspaceOwnerId, groups.length); }, [onActiveCount, workspaceOwnerId, groups.length]);
  // בהמתנה = every non-blocked group that is not confirmed joined (not joined yet or request sent).
  const notJoinedGroups = allGroups.filter((g) => !g.blocked && g.joinStatus !== 'joined');
  const blockedGroups = allGroups.filter((g) => g.blocked);
  const [loading, setLoading] = useState(!cached);
  const [deleteMode, setDeleteMode] = useState(false);
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'active' | 'not_joined' | 'blocked'>('active');
  const [joinPicked, setJoinPicked] = useState<Set<string>>(new Set());
  const [joinProgress, setJoinProgress] = useState<Record<string, string>>({});
  const [joining, setJoining] = useState(false);
  const autoJoinRef = useRef<string | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const scopeRef = useRef(workspaceOwnerId);
  scopeRef.current = workspaceOwnerId;
  const requestRef = useRef(0);
  const joinOverrides = useRef(new Map<string, JoinState>());
  const cancelJoinRef = useRef<(() => void) | null>(null);

  // Never keep another workspace's groups in local storage.
  useEffect(() => {
    purgeForeignCaches(workspaceOwnerId);
    setGroups(readCache(workspaceOwnerId)?.groups ?? []);
    setLoading(true);
    setMarkedIds(new Set());
    setJoinPicked(new Set());
    setJoinProgress({});
    setJoining(false);
    joinOverrides.current.clear();
    return () => { cancelJoinRef.current?.(); cancelJoinRef.current = null; };
  }, [workspaceOwnerId]);


  const load = useCallback(async () => {
    if (!workspaceOwnerId) { setLoading(false); return; }
    const request = ++requestRef.current;
    try {
      const { data, error } = await (supabase as any)
        .from('fb_user_groups')
        .select('id, group_id, group_name, group_icon, group_url, member_count, is_selected, page_id, is_blocked, blocked_reason, join_status')
        // Workspace-scoped so shared Facebook groups are identical for every member.
        .eq('workspace_owner_id', workspaceOwnerId)
        .order('group_name', { ascending: true });
      if (scopeRef.current !== workspaceOwnerId || request !== requestRef.current) return;
      if (error) throw error;
       // The authorized workspace owns the group directory, independently of
       // the current Page binding or Graph authentication state.
       const visible = (data ?? []) as any[];
      const nextGroups: GroupTarget[] = visible.map((r) => {
        const id = String(r.id);
        const override = joinOverrides.current.get(id);
        if (override === r.join_status) joinOverrides.current.delete(id);
        return ({
        id: String(r.id),
        groupId: String(r.group_id),
        name: String(r.group_name || r.group_id),
        icon: r.group_icon ?? null,
        url: r.group_url ?? null,
        members: typeof r.member_count === 'number' ? r.member_count : null,
        selected: r.is_selected !== false && !r.is_blocked,
        blocked: !!r.is_blocked,
        blockedReason: r.blocked_reason ?? null,
        joinStatus: override ?? (r.join_status as JoinState) ?? 'pending',
      }); });
      setGroups(nextGroups);
      try {
        localStorage.setItem(cacheKeyFor(workspaceOwnerId), JSON.stringify({ groups: nextGroups }));
      } catch { /* noop */ }
    } catch (error) {
      if (scopeRef.current === workspaceOwnerId) toast.error('טעינת הקבוצות נכשלה');
    } finally {
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
      try {
        localStorage.setItem(cacheKeyFor(workspaceOwnerId), JSON.stringify({ groups: remaining }));
      } catch { /* noop */ }
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


  const joinTargets = async (picked: GroupTarget[]) => {
    if (!picked.length || joining || !workspaceOwnerId) return;
    if (!isExtensionInstalled()) { toast.error('כדי להצטרף לקבוצות יש להתקין את תוסף Realtyz'); return; }
    // Safety: never exceed 100 joined groups; most popular groups first.
    const capacity = Math.max(0, MAX_GROUPS - groups.length);
    if (capacity === 0) { toast.error(`הגעת למגבלה של ${MAX_GROUPS} קבוצות פעילות`); return; }
    const targets = sortByPopularity(picked).slice(0, capacity);
    if (targets.length < picked.length) toast.info(`ההצטרפות הוגבלה ל-${targets.length} הקבוצות הפופולריות ביותר (מגבלה של ${MAX_GROUPS})`);
    setJoining(true);
    const owner = workspaceOwnerId;
    let ok = 0;
    for (let i = 0; i < targets.length; i += JOIN_BATCH) {
      if (i > 0) await new Promise((r) => setTimeout(r, 120000 + Math.floor(Math.random() * 120000)));
      if (scopeRef.current !== owner) return;
      const batch = targets.slice(i, i + JOIN_BATCH);
      const byBare = new Map(batch.map((g) => [bareId(g.groupId), g]));
      setJoinProgress((p) => ({ ...p, ...Object.fromEntries(batch.map((g) => [g.id, 'בתור'])) }));
      const run = joinGroupsViaExtension(
        batch.map((g) => ({ group_id: bareId(g.groupId), group_name: g.name, group_url: fbGroupUrlFrom(g.url, g.groupId) || '' })),
        (gid, status: JoinStatus) => {
          const g = byBare.get(gid);
          if (!g || scopeRef.current !== owner) return;
          if (status === 'joining') {
            setJoinProgress((p) => ({ ...p, [g.id]: 'מצטרף…' }));
            return;
          }
          const next: JoinState | null = status === 'joined' || status === 'already_member' ? 'joined' : status === 'requested' ? 'pending' : null;
          setJoinProgress((p) => ({ ...p, [g.id]: next === 'joined' ? 'הצטרפת' : next === 'pending' ? 'בהמתנה' : status === 'needs_answers' ? 'דורש השלמה' : 'נכשל' }));
          if (next) {
            ok += 1;
            joinOverrides.current.set(g.id, next);
            ++requestRef.current;
            setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, joinStatus: next } : x)));
            setJoinPicked((prev) => { const updated = new Set(prev); updated.delete(g.id); return updated; });
            void (supabase as any).from('fb_user_groups').update({ join_status: next })
              .eq('workspace_owner_id', owner).eq('id', g.id)
              .then(({ error }: { error: { message: string } | null }) => {
                if (scopeRef.current !== owner) return;
                if (error) {
                  joinOverrides.current.delete(g.id);
                  toast.error('שמירת מצב ההצטרפות נכשלה');
                }
                void load();
              });
          }
        },
      );
      cancelJoinRef.current = run.cancel;
      await run.done;
      if (scopeRef.current !== owner) return;
      cancelJoinRef.current = null;
      setJoinProgress((prev) => Object.fromEntries(Object.entries(prev).map(([id, label]) =>
        [id, label === 'מצטרף…' || label === 'בתור' ? 'ההצטרפות לא הושלמה' : label])));
    }
    setJoining(false);
    setJoinPicked(new Set());
    toast.success(`הטיפול הסתיים: ${ok} מתוך ${targets.length} קבוצות`);
    void load();
  };

  // Auto-join imported groups once per workspace visit while the extension is open.
  useEffect(() => {
    if (loading || !workspaceOwnerId || autoJoinRef.current === workspaceOwnerId) return;
    if (!notJoinedGroups.length || !isExtensionInstalled()) return;
    autoJoinRef.current = workspaceOwnerId;
    void joinTargets(notJoinedGroups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, workspaceOwnerId, notJoinedGroups.length]);

  const renderSimpleRow = (g: GroupTarget, extra?: ReactNode) => (
    <div key={g.id} className="flex flex-nowrap items-center gap-[11px] rounded-lg border border-border/70 px-2 py-1.5">
      {extra}
      <div className={cn('min-w-0 flex-1 text-right', TEXT_MD)}>
        <span title={g.name} className="block truncate">{shortenName(g.name)}</span>
        {joinProgress[g.id] && <span className={cn('block text-primary', TEXT_SM)}>{joinProgress[g.id]}</span>}
      </div>
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
      {label} ({n})
    </Button>
  );

  return (
    <div dir="rtl" className={cn('space-y-3', className)}>
      {/* Extension/sync row — "הוספת קבוצות" sits at the card's far edge. */}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1" onClick={() => setDiscoverOpen(true)}>
          <Search className="h-3.5 w-3.5" /> הוספת קבוצות
        </Button>
        <ExtensionGroupSyncCard onSynced={() => void load()} actions={actions} className="min-w-0 justify-end" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-5">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Multi-select toggle leads the tab row (RTL: right of the tabs). */}
          <div className="flex min-w-0 items-center gap-2">
            {groups.length > 0 && (
              <SelectModeToggle
                active={deleteMode}
                count={markedIds.size}
                onToggle={() => { setDeleteMode((v) => !v); setMarkedIds(new Set()); }}
              />
            )}
            <div role="tablist" className="flex min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted p-0.5">
              {tabBtn('active', 'פעילות', groups.length)}
              {tabBtn('not_joined', 'בהמתנה', notJoinedGroups.length)}
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
              <SelectAllRow total={Math.min(notJoinedGroups.length, MAX_GROUPS)} selected={joinPicked.size}
                onToggle={() => setJoinPicked(joinPicked.size > 0 ? new Set() : new Set(sortByPopularity(notJoinedGroups).slice(0, MAX_GROUPS).map((g) => g.id)))}
                className="rounded-lg border border-border">
                <Button type="button" size="sm" className="h-7 gap-1 text-[12px]" disabled={joinPicked.size === 0 || joining}
                  onClick={() => void joinTargets(notJoinedGroups.filter((g) => joinPicked.has(g.id)))}>
                  {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  הצטרפות
                </Button>
              </SelectAllRow>
              <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                {sortByPopularity(notJoinedGroups).map((g) => renderSimpleRow(g, (<>
                  <SelectBox checked={joinPicked.has(g.id)} label={g.name}
                    onChange={() => setJoinPicked((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else if (n.size < MAX_GROUPS) n.add(g.id); else toast.info(`ניתן לבחור עד ${MAX_GROUPS} קבוצות`); return n; })} />
                  {joinProgress[g.id] === 'מצטרף…' ? (
                    <Loader2 role="status" className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-label="הצטרפות בתהליך" />
                  ) : g.joinStatus === 'pending' ? <Clock className="h-4 w-4 shrink-0 text-primary" aria-label="בקשה ממתינה" /> : <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="טרם הצטרפת" />}
                </>)))}
              </div>
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
            <p className={cn('text-muted-foreground', TEXT_MD)}>אין קבוצות מיובאות. לחץ "סנכרן קבוצות".</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
              {groups.map((g) => (
                <div
                  key={g.id}
                  // Single row: (multi-select checkbox) + picture + name + open-in-new-tab.
                  // The publish checkbox is intentionally absent — tap the row to toggle,
                  // and selection boxes appear only in multi-select mode.
                  className={cn(
                    'flex flex-nowrap items-center gap-[11px] rounded-lg border px-2 py-1.5 transition-colors',
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
                  {g.icon && (
                    <img
                      src={g.icon}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className={cn('min-w-0 flex-1 text-right', TEXT_MD)}>
                    <span className="block truncate">{shortenName(g.name)}</span>
                    {typeof g.members === 'number' && g.members > 0 && (
                      <span className={cn('block text-muted-foreground tabular-nums', TEXT_SM)}>
                        {g.members.toLocaleString('he-IL')} חברים
                      </span>
                    )}
                  </div>
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
