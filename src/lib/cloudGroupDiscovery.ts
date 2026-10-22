/**
 * cloudGroupDiscovery — cloud-first Facebook group search. Asks the session
 * vault to enqueue a group-fetch job for the workspace's saved cloud session,
 * the Railway cloud runner scrapes candidate groups, and the result is
 * polled back here. No local browser extension is involved.
 */
import { supabase } from '@/integrations/supabase/client';
import type { DiscoveredGroup } from '@/lib/extensionGroupDiscovery';

type FetchJob = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  groups: DiscoveredGroup[] | null;
  error: string | null;
};

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('fb-session-vault', { body });
  if (error) throw new Error(error.message || 'cloud_fetch_failed');
  if (data?.error) throw new Error(data.message || data.error);
  return data;
};

/**
 * Search Facebook groups through the cloud runner and wait for the result.
 * Throws with a user-facing Hebrew message when no cloud session exists,
 * the worker is down, or the scan times out.
 */
export async function fetchGroupsViaCloud(
  query: string,
  opts?: { pollMs?: number; timeoutMs?: number; syncMemberships?: boolean; signal?: AbortSignal },
): Promise<DiscoveredGroup[]> {
  opts?.signal?.throwIfAborted();
  const started = await invoke(opts?.syncMemberships ? { action: 'sync_groups' } : { action: 'fetch_groups', query });
  const jobId = String(started?.job_id ?? '');
  if (!jobId) throw new Error('סריקת הקבוצות בענן לא הופעלה');

  const pollMs = opts?.pollMs ?? 4000;
  const deadline = Date.now() + (opts?.timeoutMs ?? 180_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    opts?.signal?.throwIfAborted();
    const res = await invoke({ action: 'fetch_status', job_id: jobId });
    const job = res?.job as FetchJob | undefined;
    if (!job) continue;
    if (job.status === 'completed') return Array.isArray(job.groups) ? job.groups : [];
    if (job.status === 'failed') throw new Error(job.error || 'הסריקה בענן נכשלה');
  }
  throw new Error('הסריקה בענן ארכה יותר מדי – נסו שוב');
}
