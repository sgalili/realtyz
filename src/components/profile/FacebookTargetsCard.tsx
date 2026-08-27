import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ExtensionGroupSyncCard } from '@/components/social/ExtensionGroupSyncCard';

type GroupTarget = { id: string; groupId: string; name: string; icon: string | null; url: string | null; selected: boolean };

/** Minimum readable font size across this card. */
const TEXT_SM = 'text-[14px]';
const TEXT_MD = 'text-[15px]';

/** Local cache so pages + groups render instantly on the next visit. */
const CACHE_KEY = 'realtyz_fb_targets_cache';

function readCache(): { pages: PageTarget[]; groups: GroupTarget[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pages) || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * FacebookTargetsCard — the single place where a broker chooses WHICH connected
 * Facebook pages and imported groups the system is allowed to publish to.
 */
export function FacebookTargetsCard({ className, actions }: { className?: string; actions?: ReactNode }) {
  const cached = readCache();
  const [pages, setPages] = useState<PageTarget[]>(cached?.pages ?? []);
  const [groups, setGroups] = useState<GroupTarget[]>(cached?.groups ?? []);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async () => {
    try {
      const [pageRes, groupRes] = await Promise.all([
        (supabase as any)
          .from('messenger_page_bindings')
          .select('id, page_id, page_name, page_avatar_url, is_selected')
          .order('updated_at', { ascending: false }),
        (supabase as any)
          .from('fb_user_groups')
          .select('id, group_id, group_name, group_icon, is_selected')
          .order('group_name', { ascending: true }),
      ]);
      const nextPages: PageTarget[] = ((pageRes?.data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        pageId: String(r.page_id),
        name: String(r.page_name || r.page_id),
        avatar: r.page_avatar_url ?? null,
        selected: r.is_selected !== false,
      }));
      const nextGroups: GroupTarget[] = ((groupRes?.data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        groupId: String(r.group_id),
        name: String(r.group_name || r.group_id),
        icon: r.group_icon ?? null,
        selected: r.is_selected !== false,
      }));
      setPages(nextPages);
      setGroups(nextGroups);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ pages: nextPages, groups: nextGroups }));
      } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const togglePage = async (target: PageTarget) => {
    const next = !target.selected;
    setPages((prev) => prev.map((p) => (p.id === target.id ? { ...p, selected: next } : p)));
    const { error } = await (supabase as any)
      .from('messenger_page_bindings')
      .update({ is_selected: next })
      .eq('id', target.id);
    if (error) {
      setPages((prev) => prev.map((p) => (p.id === target.id ? { ...p, selected: !next } : p)));
      toast.error('עדכון בחירת העמוד נכשל', { description: error.message });
    }
  };

  const toggleGroup = async (target: GroupTarget) => {
    const next = !target.selected;
    setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, selected: next } : g)));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_selected: next })
      .eq('id', target.id);
    if (error) {
      setGroups((prev) => prev.map((g) => (g.id === target.id ? { ...g, selected: !next } : g)));
      toast.error('עדכון בחירת הקבוצה נכשל', { description: error.message });
    }
  };

  const setAllGroups = async (next: boolean) => {
    const ids = groups.map((g) => g.id);
    if (ids.length === 0) return;
    setGroups((prev) => prev.map((g) => ({ ...g, selected: next })));
    const { error } = await (supabase as any)
      .from('fb_user_groups')
      .update({ is_selected: next })
      .in('id', ids);
    if (error) {
      toast.error('עדכון הבחירה נכשל', { description: error.message });
      void load();
    }
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
        <>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Flag className="h-3.5 w-3.5" /> עמודים ({pages.filter((p) => p.selected).length}/{pages.length})
            </div>
            {pages.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין עמודים מחוברים.</p>
            ) : (
              pages.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-2 py-1.5"
                >
                  <Checkbox checked={p.selected} onCheckedChange={() => void togglePage(p)} />
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.name} className="h-6 w-6 rounded-full object-cover" loading="lazy" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</span>
                </label>
              ))
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> קבוצות ({selectedGroups}/{groups.length})
              </div>
              {groups.length > 0 && (
                <button
                  type="button"
                  onClick={() => void setAllGroups(selectedGroups !== groups.length)}
                  className="text-[11px] font-semibold text-primary underline"
                >
                  {selectedGroups === groups.length ? 'בטל הכל' : 'בחר הכל'}
                </button>
              )}
            </div>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין קבוצות מיובאות. לחץ "סנכרן קבוצות".</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                {groups.map((g) => (
                  <label
                    key={g.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-2 py-1.5"
                  >
                    <Checkbox checked={g.selected} onCheckedChange={() => void toggleGroup(g)} />
                    {g.icon ? (
                      <img src={g.icon} alt={g.name} className="h-5 w-5 rounded object-cover" loading="lazy" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-xs">{g.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default FacebookTargetsCard;
