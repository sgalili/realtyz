import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

export type FbGroupMeta = {
  name: string;
  icon: string | null;
  memberCount?: number | null;
  url?: string | null;
};

let cacheOwner: string | null = null;
let cache: Record<string, FbGroupMeta> | null = null;
let inflight: Promise<Record<string, FbGroupMeta>> | null = null;

async function fetchGroupMeta(owner: string): Promise<Record<string, FbGroupMeta>> {
  if (cache && cacheOwner === owner) return cache;
  if (cacheOwner !== owner) { cache = null; inflight = null; cacheOwner = owner; }
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const map: Record<string, FbGroupMeta> = {};
    try {
      const { data } = await (supabase as any)
        .from('fb_user_groups')
        .select('group_id, group_name, group_icon, group_url, member_count')
        .eq('workspace_owner_id', owner)
        .limit(1000);
      (data ?? []).forEach((g: any) => {
        const id = String(g?.group_id ?? '');
        if (!id) return;
        const meta: FbGroupMeta = {
          name: g.group_name || id,
          icon: g.group_icon ?? null,
          memberCount: typeof g.member_count === 'number' ? g.member_count : null,
          url: g.group_url ?? null,
        };
        map[id] = meta;
        map[id.replace(/^ext:/, '')] = meta;
      });
    } catch { /* non-fatal */ }
    cache = map;
    inflight = null;
    return map;
  })();
  return inflight;
}

/**
 * Shared, session-cached Facebook group name / member-count lookup so scheduled
 * post cards can show their target groups without one query per card.
 */
export function useFbGroupMeta() {
  const owner = useActiveWorkspaceOwnerId();
  const [meta, setMeta] = useState<Record<string, FbGroupMeta>>(cache ?? {});
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    void fetchGroupMeta(owner).then((m) => { if (alive) setMeta(m); });
    return () => { alive = false; };
  }, [owner]);
  return meta;
}
