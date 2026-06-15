import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { CustomGroupsQuickShare } from './CustomGroupsQuickShare';

function normalize(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Mirror of CustomGroupsQuickShare scoped to a single published campaign.
 * Looks up which custom_user_groups received a manual_share row whose body
 * overlaps this campaign's body, then mounts the real quick-share UI with
 * the matching group IDs restricted. Renders nothing if no groups matched.
 */
export function CampaignGroupBreakdown({
  workspaceOwnerId,
  campaignBody,
  campaignCreatedAt,
}: {
  workspaceOwnerId: string | null;
  campaignBody: string | null;
  campaignCreatedAt: string | null;
}) {
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const matchKey = useMemo(() => normalize(campaignBody ?? '').slice(0, 60), [campaignBody]);

  useEffect(() => {
    if (!workspaceOwnerId || !matchKey || matchKey.length < 12) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const createdAt = campaignCreatedAt ? new Date(campaignCreatedAt).getTime() : Date.now();
      const since = new Date(createdAt - 2 * 24 * 3600 * 1000).toISOString();
      const until = new Date(createdAt + 2 * 24 * 3600 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from('campaign_activity_queue')
        .select('target_ref, payload')
        .eq('workspace_owner_id', workspaceOwnerId)
        .eq('activity_type', 'manual_share')
        .gte('created_at', since)
        .lte('created_at', until);
      if (cancelled) return;
      const ids = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        const t = normalize([r.payload?.outbound_text, r.payload?.body].filter(Boolean).join(' '));
        if (r.target_ref && t.includes(matchKey)) ids.add(String(r.target_ref));
      }
      setGroupIds(Array.from(ids));
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [workspaceOwnerId, matchKey, campaignCreatedAt]);

  if (!loaded || groupIds.length === 0) return null;

  return (
    <div className="mx-4 mb-4" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/40 px-3 py-2 dark:bg-amber-950/10"
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          פרסום בקבוצות פייסבוק
        </span>
        <span className="mr-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300" dir="ltr">
          {groupIds.length}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open ? (
        <div className="mt-2">
          <CustomGroupsQuickShare body={campaignBody ?? ''} restrictToGroupIds={groupIds} />
        </div>
      ) : null}
    </div>
  );
}

export default CampaignGroupBreakdown;
