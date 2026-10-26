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

const invoke = async (body: Record<string, unknown>, signal: AbortSignal) => {
  const { data, error } = await supabase.functions.invoke('fb-session-vault', { body, signal });
  if (error) {
    const details = await error.context?.clone?.().json().catch(() => null);
    throw new Error(details?.message || details?.error || error.message || 'סריקת הקבוצות בפייסבוק נכשלה');
  }
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
  const controller = new AbortController();
  const timeoutMessage = 'סריקת הקבוצות בפייסבוק ארכה יותר מדי. נסו שוב בעוד רגע.';
  const cancel = () => controller.abort(opts?.signal?.reason);
  opts?.signal?.addEventListener('abort', cancel, { once: true });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    timeout = setTimeout(() => controller.abort(new Error(timeoutMessage)), opts?.timeoutMs ?? 60_000);
  });
  const request = (body: Record<string, unknown>) => Promise.race([invoke(body, controller.signal), interrupted]);
  try {
  const started = await request(opts?.syncMemberships ? { action: 'sync_groups' } : { action: 'fetch_groups', query });
  const jobId = String(started?.job_id ?? '');
  if (!jobId) throw new Error('סריקת הקבוצות בפייסבוק לא הופעלה');

  const pollMs = opts?.pollMs ?? 4000;
  while (true) {
    await Promise.race([new Promise((r) => setTimeout(r, pollMs)), interrupted]);
    controller.signal.throwIfAborted();
    const res = await request({ action: 'fetch_status', job_id: jobId });
    const job = res?.job as FetchJob | undefined;
    if (!job) continue;
    if (job.status === 'completed') return Array.isArray(job.groups) ? job.groups : [];
    if (job.status === 'failed') throw new Error(job.error || 'הסריקה בפייסבוק נכשלה');
  }
  } finally {
    clearTimeout(timeout);
    opts?.signal?.removeEventListener('abort', cancel);
  }
}
