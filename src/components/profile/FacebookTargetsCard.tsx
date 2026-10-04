import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Ban, ExternalLink, Loader2, Search, Trash2, Undo2, Users } from 'lucide-react';
import { GroupDiscoveryDialog } from '@/components/social/GroupDiscoveryDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectModeToggle, SelectAllRow, SelectBox } from '@/components/ui/multi-select-controls';
import { cn } from '@/lib/utils';
import { shortenName } from '@/lib/shortenName';
import { openExternal } from '@/lib/openExternal';
import { ExtensionGroupSyncCard } from '@/components/social/ExtensionGroupSyncCard';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { fbGroupUrlFrom } from '@/lib/fbGroupUrl';

type GroupTarget = { id: string; groupId: string; name: string; icon: string | null; url: string | null; members: number | null; selected: boolean; blocked?: boolean; blockedReason?: string | null };

const bareId = (id: string) => id.replace(/^(ext:|manual:)/, '');

/** Minimum readable font size across this card. */
const TEXT_SM = 'text-[14px]';
const TEXT_MD = 'text-[15px]';

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
export function FacebookTargetsCard({ className, actions }: { className?: string; actions?: ReactNode }) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { data: pageBinding } = useMetaPageBinding();
  const cached = readCache(workspaceOwnerId);
  const [allGroups, setGroups] = useState<GroupTarget[]>(cached?.groups ?? []);
  const groups = allGroups.filter((g) => !g.blocked);
  const blockedGroups = allGroups.filter((g) => g.blocked);
  const [loading, setLoading] = useState(!cached);
  const [deleteMode, setDeleteMode] = useState(false);
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'active' | 'blocked'>('active');
  const [discoverOpen, setDiscoverOpen] = useState(false);

  // Never keep another workspace's groups in local storage.
  useEffect(() => { purgeForeignCaches(workspaceOwnerId); setMarkedIds(new Set()); }, [workspaceOwnerId]);


  const load = useCallback(async () => {
    if (!workspaceOwnerId) return;
    try {
      const { data } = await (supabase as any)
        .from('fb_user_groups')
        .select('id, group_id, group_name, group_icon, group_url, member_count, is_selected, page_id, is_blocked, blocked_reason')
        // Workspace-scoped so shared Facebook groups are identical for every member.
        .eq('workspace_owner_id', workspaceOwnerId)
        .order('group_name', { ascending: true });
      // TENANT ISOLATION: hide groups bound to a Facebook page this workspace is
      // no longer connected to.
      const connectedPage = pageBinding?.pageId ?? null;
      const visible = ((data ?? []) as any[]).filter(
        (r) => !r?.page_id || !connectedPage || String(r.page_id) === connectedPage,
      );
      const nextGroups: GroupTarget[] = visible.map((r) => ({
        id: String(r.id),
        groupId: String(r.group_id),
        name: String(r.group_name || r.group_id),
        icon: r.group_icon ?? null,
        url: r.group_url ?? null,
        members: typeof r.member_count === 'number' ? r.member_count : null,
        selected: r.is_selected !== false && !r.is_blocked,
        blocked: !!r.is_blocked,
        blockedReason: r.blocked_reason ?? null,
      }));
      setGroups(nextGroups);
      try {
        localStorage.setItem(cacheKeyFor(workspaceOwnerId), JSON.stringify({ groups: nextGroups }));
      } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, [workspaceOwnerId, pageBinding?.pageId]);

  useEffect(() => { void load(); }, [load]);

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
    else toast.success('הקבוצה הוחזרה לרשימה הפעילה');
  };

  const blockGroup = async (target: GroupTarget) => {
    setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, blocked: true, selected: false, blockedReason: 'נחסם ידנית' } : g)));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_blocked: true, blocked_reason: 'נחסם ידנית', blocked_at: new Date().toISOString(), is_selected: false })
      .eq('workspace_owner_id', workspaceOwnerId)
      .eq('id', target.id);
    if (error) { toast.error('חסימת הקבוצה נכשלה', { description: error.message }); void load(); }
  };

  const selectedGroups = groups.filter((g) => g.selected).length;

  return (
    <div dir="rtl" className={cn('rounded-xl border border-border bg-background p-3 space-y-3', className)}>
      <ExtensionGroupSyncCard onSynced={() => void load()} actions={actions} />

      {loading ? (
        <div className="flex items-center justify-center py-5">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <div role="tablist" className="flex min-w-0 flex-1 rounded-lg bg-muted p-0.5">
              <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => { setTab('active'); setDeleteMode(false); }}
                className={cn('flex-1 rounded-md px-2 py-1 font-semibold', TEXT_SM, tab === 'active' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                פעילות
              </button>
              <button type="button" role="tab" aria-selected={tab === 'blocked'} onClick={() => { setTab('blocked'); setDeleteMode(false); }}
                className={cn('flex-1 rounded-md px-2 py-1 font-semibold', TEXT_SM, tab === 'blocked' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                חסומות{blockedGroups.length > 0 ? ` (${blockedGroups.length})` : ''}
              </button>
            </div>
            <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1" onClick={() => setDiscoverOpen(true)}>
              <Search className="h-3.5 w-3.5" /> הוספת קבוצות
            </Button>
          </div>
          <GroupDiscoveryDialog
            open={discoverOpen}
            onOpenChange={setDiscoverOpen}
            blockedIds={new Set(blockedGroups.map((g) => bareId(g.groupId)))}
            knownIds={new Set(groups.map((g) => bareId(g.groupId)))}
            onJoined={() => void load()}
          />
          {tab === 'blocked' ? (
            blockedGroups.length === 0 ? (
              <p className={cn('text-muted-foreground', TEXT_MD)}>אין קבוצות חסומות. קבוצות שהפרסום בהן נכשל או הוגבל יופיעו כאן ולא ייבחרו בקמפיינים.</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                {blockedGroups.map((g) => (
                  <div key={g.id} className="flex flex-nowrap items-center gap-[11px] rounded-lg border border-border/70 px-2 py-1.5">
                    <Ban className="h-4 w-4 shrink-0 text-destructive" />
                    <div className={cn('min-w-0 flex-1 text-right', TEXT_MD)}>
                      <span title={g.name} className="block truncate">{shortenName(g.name)}</span>
                      {g.blockedReason && <span title={g.blockedReason} className={cn('block truncate text-muted-foreground', TEXT_SM)}>{g.blockedReason}</span>}
                    </div>
                    <button type="button" onClick={() => void unblock(g)} title="החזר לרשימה הפעילה"
                      className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-primary hover:bg-muted', TEXT_SM)}>
                      <Undo2 className="h-3.5 w-3.5" /> שחרור
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (<>
          <div className="flex items-center justify-between gap-2">
            <div className={cn('flex items-center gap-1.5 font-semibold text-muted-foreground', TEXT_SM)}>
              <Users className="h-4 w-4" /> קבוצות ({selectedGroups}/{groups.length})
            </div>
            {groups.length > 0 && (
              <SelectModeToggle
                active={deleteMode}
                count={markedIds.size}
                onToggle={() => { setDeleteMode((v) => !v); setMarkedIds(new Set()); }}
              />
            )}
          </div>

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
                  // Single row: checkbox + picture + name + open-in-new-tab.
                  // `!flex` beats the parent's `[&_label]:block` RTL overrides.
                  className="flex flex-nowrap items-center gap-[11px] rounded-lg border border-border/70 px-2 py-1.5"
                >
                  {deleteMode ? (
                    <SelectBox
                      checked={markedIds.has(g.id)}
                      onChange={() => toggleMark(g.id)}
                      label={g.name}
                    />
                  ) : (
                    <Checkbox
                      className="shrink-0"
                      checked={g.selected}
                      onCheckedChange={() => void toggleGroup(g)}
                      aria-label={g.name}
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
                  <button
                    type="button"
                    onClick={() => (deleteMode ? toggleMark(g.id) : void toggleGroup(g))}
                    className={cn('min-w-0 flex-1 text-right', TEXT_MD)}
                  >
                    <span className="block truncate">{shortenName(g.name)}</span>
                    {typeof g.members === 'number' && g.members > 0 && (
                      <span className={cn('block text-muted-foreground tabular-nums', TEXT_SM)}>
                        {g.members.toLocaleString('he-IL')} חברים
                      </span>
                    )}
                  </button>
                  {!deleteMode && (
                    <button type="button" aria-label={`חסימת הקבוצה ${g.name}`} title="העבר לקבוצות חסומות"
                      onClick={() => void blockGroup(g)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`פתח את הקבוצה ${g.name} בלשונית חדשה`}
                    title="צפה בקבוצה בלשונית חדשה"
                    onClick={() =>
                      openExternal(fbGroupUrlFrom(g.url, g.groupId))
                    }
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
