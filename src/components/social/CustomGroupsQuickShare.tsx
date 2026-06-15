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

/**
 * Workspace-scoped Facebook groups directory. User picks ONE group from the
 * list, then a single "שיתוף ידני מהיר" button appears below — clicking it
 * copies the canonical post (with hardcoded byline+license footer) and opens
 * the selected group in a new tab.
 */
export function CustomGroupsQuickShare({ body }: { body: string }) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState(false);

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

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  const handleShare = async () => {
    if (!selected) return;
    const text = ensureCanonicalFooter((body ?? '').trim());
    if (!text) {
      toast.error('אין טקסט לפרסום — חולל קודם תוכן');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
      toast.success(`הטקסט הועתק · פותח את "${selected.group_name}"`);
    } catch {
      toast.error('העתקה נכשלה — העתק ידנית');
    }
    window.open(selected.group_url, '_blank', 'noopener,noreferrer');
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
        Facebook חוסם פרסום אוטומטי לקבוצות שאינך מנהל בהן. בחר קבוצה מהרשימה — ואז יופיע כפתור השיתוף שיעתיק את הטקסט ויפתח את הקבוצה בכרטיסייה חדשה.
      </p>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-background">
        {groups.map((g) => {
          const isSelected = selectedId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedId(isSelected ? null : g.id)}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-right transition',
                isSelected ? 'bg-amber-100/70 dark:bg-amber-900/30' : 'hover:bg-muted/50',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{g.group_name}</div>
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

      {selected ? (
        <button
          type="button"
          onClick={handleShare}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition',
            justCopied
              ? 'bg-emerald-600 text-white'
              : 'bg-[#1877F2] text-white hover:bg-[#1668d8]',
          )}
        >
          {justCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {justCopied ? 'הועתק · פותח את הקבוצה' : `שיתוף ידני ל-"${selected.group_name}"`}
        </button>
      ) : null}
    </div>
  );
}

export default CustomGroupsQuickShare;
