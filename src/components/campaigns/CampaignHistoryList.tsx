import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useFbGroupMeta } from '@/hooks/useFbGroupMeta';
import { GroupStatusChips, groupResultMap } from '@/components/campaigns/GroupStatusChips';

type Row = {
  id: string;
  campaign_name: string | null;
  message_body: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string;
  media_urls: any;
  group_ids: any;
  provider_response: any;
  failure_reason?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  sent: 'פורסם',
  published: 'פורסם',
  completed: 'פורסם',
  failed: 'נכשל',
};

/**
 * Read-only history of every past post: destination group / page, the exact
 * timestamp and whether Facebook actually accepted it.
 * One-shot fetch — no polling, so it never burns background credits.
 */
export function CampaignHistoryList() {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const groupMeta = useFbGroupMeta();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const scope = workspaceOwnerId ?? auth.user?.id;
      if (!scope) { setRows([]); return; }
      const { data } = await supabase
        .from('campaign_logs')
        .select('id,campaign_name,message_body,status,sent_at,created_at,media_urls,group_ids,provider_response,failure_reason')
        .or(`workspace_owner_id.eq.${scope},user_id.eq.${scope}`)
        .in('status', ['sent', 'published', 'completed', 'failed'])
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (!cancelled) setRows(((data ?? []) as unknown) as Row[]);
    })();
    return () => { cancelled = true; };
  }, [workspaceOwnerId]);

  if (rows === null) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">אין פוסטים בהיסטוריה</p>;
  }

  return (
    <div className="space-y-2" dir="rtl">
      {rows.map((r) => {
        const gids: string[] = Array.isArray(r.group_ids) ? r.group_ids.map((g: any) => String(g)) : [];
        const results = groupResultMap(r.provider_response?.group_results);
        const failed = String(r.status || '').toLowerCase() === 'failed';
        const first = Array.isArray(r.media_urls) ? r.media_urls[0] : null;
        const img = typeof first === 'string' ? first : first?.url;
        return (
          <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
            {img ? <img src={img} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" loading="lazy" /> : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{(r.message_body || '').trim().split('\n')[0] || r.campaign_name || 'פוסט'}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${failed ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'}`}>
                  {STATUS_LABEL[String(r.status)] ?? r.status}
                </span>
              </div>
              <GroupStatusChips
                groupIds={gids}
                meta={groupMeta}
                results={results}
                defaultState={failed ? 'failed' : 'published'}
                emptyLabel="פורסם לעמוד בלבד (ללא קבוצות)"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(r.sent_at || r.created_at).toLocaleString('he-IL')}
                {failed && r.failure_reason ? ` · ${r.failure_reason}` : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CampaignHistoryList;
