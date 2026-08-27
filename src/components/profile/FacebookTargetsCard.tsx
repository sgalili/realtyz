import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { shortenName } from '@/lib/shortenName';
import { ExtensionGroupSyncCard } from '@/components/social/ExtensionGroupSyncCard';

type GroupTarget = { id: string; groupId: string; name: string; icon: string | null; url: string | null; selected: boolean };

/** Minimum readable font size across this card. */
const TEXT_SM = 'text-[14px]';
const TEXT_MD = 'text-[15px]';

/** Local cache so groups render instantly on the next visit. */
const CACHE_KEY = 'realtyz_fb_targets_cache';

function readCache(): { groups: GroupTarget[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
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
  const cached = readCache();
  const [groups, setGroups] = useState<GroupTarget[]>(cached?.groups ?? []);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async () => {
    try {
      const { data } = await (supabase as any)
        .from('fb_user_groups')
        .select('id, group_id, group_name, group_icon, group_url, is_selected')
        .order('group_name', { ascending: true });
      const nextGroups: GroupTarget[] = ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        groupId: String(r.group_id),
        name: String(r.group_name || r.group_id),
        icon: r.group_icon ?? null,
        url: r.group_url ?? null,
        selected: r.is_selected !== false,
      }));
      setGroups(nextGroups);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ groups: nextGroups }));
      } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className={cn('flex items-center gap-1.5 font-semibold text-muted-foreground', TEXT_SM)}>
              <Users className="h-4 w-4" /> קבוצות ({selectedGroups}/{groups.length})
            </div>
            {groups.length > 0 && (
              <button
                type="button"
                onClick={() => void setAllGroups(selectedGroups !== groups.length)}
                className={cn('font-semibold text-primary underline', TEXT_SM)}
              >
                {selectedGroups === groups.length ? 'בטל הכל' : 'בחר הכל'}
              </button>
            )}
          </div>
          {groups.length === 0 ? (
            <p className={cn('text-muted-foreground', TEXT_MD)}>אין קבוצות מיובאות. לחץ "סנכרן קבוצות".</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-[11px] rounded-lg border border-border/70 px-2 py-1.5"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-[11px]">
                    <Checkbox checked={g.selected} onCheckedChange={() => void toggleGroup(g)} />
                    {g.icon ? (
                      <img src={g.icon} alt={g.name} className="h-5 w-5 rounded object-cover" loading="lazy" />
                    ) : null}
                    <span className={cn('min-w-0 flex-1 truncate', TEXT_MD)}>{g.name}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`פתח את הקבוצה ${g.name} בלשונית חדשה`}
                    title="צפה בקבוצה בלשונית חדשה"
                    onClick={() =>
                      window.open(g.url || `https://www.facebook.com/groups/${g.groupId}`, '_blank', 'noopener,noreferrer')
                    }
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FacebookTargetsCard;
