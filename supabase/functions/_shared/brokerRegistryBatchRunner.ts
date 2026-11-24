import { refreshAdminRegistryName } from './adminRegistryRefresh.ts';
import { transientBrokerConnectionError } from './brokerRecovery.ts';
/** Persist after each serial item; cancellation and lease are rechecked atomically at save and checkpoint. */
export async function runRegistryBatchStep(admin: any, id: string, refresh = refreshAdminRegistryName) {
  const { data, error } = await admin.rpc('claim_broker_registry_batch', { _id: id });
  if (error) throw error;
  const batch = data?.[0];
  if (!batch?.lease_token) return { idle: true };
  try {
    for (let i = 0; i < 3; i++) {
      const { data: item, error: readError } = await admin.from('broker_registry_batch_items').select('id,broker_id,license_number').eq('batch_id', id).eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at').order('id').limit(1).maybeSingle();
      if (readError) throw readError;
      if (!item) break;
      const { data: current, error: scopeError } = await admin.from('broker_registry_batches').select('status,lease_token').eq('id', id).maybeSingle();
      if (scopeError) throw scopeError;
      if (current?.status !== 'running' || current.lease_token !== batch.lease_token) break;
      let outcome = 'failed', retry = false;
      try {
        const saved = await refresh(admin, item.broker_id, item.license_number, batch.created_by, { id, token: batch.lease_token });
        if (saved.profile?.id === item.broker_id && saved.profile.broker_license_number === item.license_number) outcome = 'verified';
      } catch (reason) {
        if ((reason as {code?: string}).code === 'license_not_found') outcome = 'missing';
        retry = (reason as { status?: number }).status === 503 || transientBrokerConnectionError(reason);
      }
      const { data: done, error: finishError } = await admin.rpc('finish_broker_registry_item', { _batch: id, _token: batch.lease_token, _item: item.id, _status: outcome, _retry: retry });
      if (finishError) throw finishError;
      if (!done) break;
    }
    return { idle: false };
  } finally {
    const { error } = await admin.rpc('release_broker_registry_batch', { _id: id, _token: batch.lease_token });
    if (error) throw error;
  }
}
