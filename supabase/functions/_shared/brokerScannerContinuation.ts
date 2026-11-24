import { brokerFailure, withBrokerConnectionRetry } from './brokerRecovery.ts';

/** Repeating this auxiliary insert is safe: the existing unique source/broker guards prevent duplicate inquiries. */
export async function continueBrokerScanner(admin: any, job: { id: string; broker_id: string; listing_id: string; source_url: string; created_by: string; batch_id?: string | null }) {
  return withBrokerConnectionRetry(() => continueOnce(admin, job));
}

async function continueOnce(admin: any, job: { id: string; broker_id: string; listing_id: string; source_url: string; created_by: string; batch_id?: string | null }) {
  const { data: line, error: le } = await admin.from('broker_wa_scanner_settings').select('enabled,paused').eq('id',true).maybeSingle();
  if (le) throw brokerFailure('scanner_settings_read_failed', le);
  if (!line?.enabled || line.paused) return false;
  const { data: contact, error: ce } = await admin.from('broker_whatsapp_contacts').select('broker_id').eq('broker_id',job.broker_id).eq('workspace_owner_id',job.broker_id).maybeSingle();
  if (ce) throw brokerFailure('scanner_contact_read_failed', ce);
  if (contact) return false;
  const { data: eligible, error: ee } = await admin.rpc('scanner_broker_eligible',{_broker:job.broker_id,_listing:job.listing_id,_creator:job.created_by,_source:job.source_url});
  if (ee) throw brokerFailure('scanner_eligibility_check_failed', ee);
  if (!eligible) return false;
  let batchId: string | undefined;
  if (job.batch_id) {
    const {data:batch,error}=await admin.from('broker_whatsapp_batches').select('status,persistent').eq('id',job.batch_id).maybeSingle();
    if(error)throw brokerFailure('scanner_batch_read_failed',error);
    if(batch?.persistent) {if(batch.status!=='running')return false;batchId=job.batch_id;}
  }
  const { error } = await admin.from('broker_wa_scanner_jobs').insert({broker_id:job.broker_id,workspace_owner_id:job.broker_id,listing_id:job.listing_id,source_url:job.source_url,created_by:job.created_by,...(batchId?{batch_id:batchId}:{}),consent_at:new Date().toISOString()});
  if (error?.code === '23505') return false;
  if (error) throw brokerFailure('scanner_continuation_enqueue_failed', error);
  return true;
}