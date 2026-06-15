import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Copy, ExternalLink, Users, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CustomGroup = {
  id: string;
  group_name: string;
  group_url: string;
};

/**
 * Renders a list of manually-saved Facebook groups (workspace-scoped) with a
 * "Quick Manual Share" button per row. Clicking copies the prepared post body
 * to the clipboard and opens the group URL in a new tab — a workaround for
 * Facebook Graph API restrictions on non-admin group posting.
 */
export function CustomGroupsQuickShare({ body }: { body: string }) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  if (loading || groups.length === 0) return null;

  const handleShare = async (g: CustomGroup) => {
    const text = (body ?? '').trim();
    if (!text) {
      toast.error('אין טקסט לפרסום — חולל קודם תוכן');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(g.id);
      setTimeout(() => setCopiedId((cur) => (cur === g.id ? null : cur)), 2000);
      toast.success(`הטקסט הועתק · פותח את "${g.group_name}"`);
    } catch {
      toast.error('העתקה נכשלה — העתק ידנית');
    }
    window.open(g.group_url, '_blank', 'noopener,noreferrer');
  };

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
        Facebook חוסם פרסום אוטומטי לקבוצות שאינך מנהל בהן. לחץ על הקבוצה — הטקסט יועתק ללוח, והקבוצה תיפתח בכרטיסייה חדשה להדבקה.
      </p>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-background">
        {groups.map((g) => {
          const copied = copiedId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => handleShare(g)}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-right transition',
                copied ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'hover:bg-muted/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{g.group_name}</div>
                <div className="flex items-center gap-1 truncate text-[10px] text-muted-foreground" dir="ltr">
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{g.group_url}</span>
                </div>
              </div>
              <span className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition',
                copied ? 'bg-emerald-600 text-white' : 'bg-[#1877F2] text-white hover:bg-[#1668d8]',
              )}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'הועתק' : 'שיתוף ידני מהיר'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CustomGroupsQuickShare;
