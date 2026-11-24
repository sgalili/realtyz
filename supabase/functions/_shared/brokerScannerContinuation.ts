/** Continue the same authorized discovery after an HTML no-match, even after the admin leaves the page. */
export async function continueBrokerScanner(admin: any, job: { id: string; broker_id: string; listing_id: string; source_url: string; created_by: string }) {
  const { data: line, error: le } = await admin.from('broker_wa_scanner_settings').select('enabled,paused').eq('id',true).maybeSingle();
  if (le) throw new Error('scanner_settings_read_failed');
  if (!line?.enabled || line.paused) return false;
  const { data: contact, error: ce } = await admin.from('broker_whatsapp_contacts').select('broker_id').eq('broker_id',job.broker_id).eq('workspace_owner_id',job.broker_id).maybeSingle();
  if (ce) throw new Error('scanner_contact_read_failed');
  if (contact) return false;
  const { data: eligible, error: ee } = await admin.rpc('scanner_broker_eligible',{_broker:job.broker_id,_listing:job.listing_id,_creator:job.created_by,_source:job.source_url});
  if (ee) throw new Error('scanner_eligibility_check_failed');
  if (!eligible) return false;
  const { error } = await admin.from('broker_wa_scanner_jobs').insert({broker_id:job.broker_id,workspace_owner_id:job.broker_id,listing_id:job.listing_id,source_url:job.source_url,created_by:job.created_by,consent_at:new Date().toISOString()});
  if (error?.code === '23505') return false;
  if (error) throw new Error('scanner_continuation_enqueue_failed');
  return true;
}