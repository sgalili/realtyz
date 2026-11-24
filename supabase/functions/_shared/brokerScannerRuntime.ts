import { adminClient, safeEqual } from './authz.ts';
import { normalizeBrokerWhatsApp } from './brokerWhatsApp.ts';
import { replyContact, scannerReply } from './brokerScannerPolicy.ts';
import { brokerFailure, withBrokerConnectionRetry } from './brokerRecovery.ts';

export function scannerCredentials() {
  const instance = Deno.env.get('GREEN_SCANNER_INSTANCE_ID') ?? '';
  const token = Deno.env.get('GREEN_SCANNER_API_TOKEN') ?? '';
  const webhook = Deno.env.get('GREEN_SCANNER_WEBHOOK_TOKEN') ?? '';
  return /^\d{6,20}$/.test(instance) && token.length >= 10 && webhook.length >= 32 ? { instance, token, webhook } : null;
}

/** Green authenticates by URL path; the connector's header/query schemes cannot represent it. */
export async function scannerGreen(method: string, body?: Record<string, unknown>) {
  const credentials = scannerCredentials();
  if (!credentials) throw Object.assign(new Error('scanner_credentials_missing'), { status: 503 });
  const base = Deno.env.get('GREEN_SCANNER_API_BASE') ?? 'https://api.green-api.com';
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || !/^api\d*\.(?:green-api|greenapi)\.com$/.test(url.hostname) || url.pathname !== '/') throw new Error('invalid_scanner_api_base');
  const request = async () => { try {
    const response = await fetch(`${url.origin}/waInstance${credentials.instance}/${method}/${credentials.token}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    const raw = await response.text();
    if (!response.ok) throw Object.assign(new Error(`green_http_${response.status}`), { status: response.status });
    if (raw.length > 200000) throw Object.assign(new Error('green_response_too_large'), { status: 502 });
    return JSON.parse(raw) as Record<string, any>;
  } catch (error) {
    // No provider text/URL in logs: the path contains the private API token.
    const status = typeof (error as {status?:unknown}).status === 'number' ? (error as {status:number}).status : 504;
    throw Object.assign(new Error(`green_request_failed_${status}`), { status });
  }
  };
  // Only these two provider methods are reads. sendMessage must never be replayed after an uncertain response.
  return ['getStateInstance','getSettings'].includes(method) && !body ? withBrokerConnectionRetry(request) : request();
}

export async function officialPhones(admin = adminClient()): Promise<string[]> {
  const { data, error } = await admin.from('wa_providers').select('config').eq('is_official', true);
  if (error) throw brokerFailure('official_identity_unavailable', error);
  const result = new Set(['972537983832']); // Mirrors officialWa.ts fallback, never a sender fallback.
  for (const row of data ?? []) {
    const config = row.config as Record<string, unknown> | null;
    for (const field of ['display_phone_number','phone_number']) {
      const phone = normalizeBrokerWhatsApp(String(config?.[field] ?? ''));
      if (phone) result.add(phone);
    }
  }
  return [...result];
}

export async function scannerError(kind: 'send' | 'webhook', reason: string, immediate = false, admin = adminClient()) {
  const { error } = await admin.rpc('record_broker_wa_scanner_error', { _kind: kind, _reason: reason, _immediate: immediate });
  if (error) throw brokerFailure('scanner_error_record_failed', error);
}

export async function checkScannerConnection(admin = adminClient()) {
  const credentials = scannerCredentials();
  if (!credentials) return { ok: false, reason: 'scanner_credentials_missing' };
  const { data: reused, error } = await admin.from('workspace_whatsapp_settings').select('workspace_owner_id').eq('green_api_instance_id',credentials.instance).limit(1).maybeSingle();
  if (error) throw brokerFailure('scanner_isolation_check_failed', error);
  if (reused) return { ok: false, reason: 'scanner_instance_in_use_by_workspace' };
  const state = await scannerGreen('getStateInstance');
  if (state.stateInstance !== 'authorized') return { ok: false, reason: 'scanner_disconnected' };
  const settings = await scannerGreen('getSettings');
  const phone = normalizeBrokerWhatsApp(String(settings.wid ?? '').replace(/@c\.us$/, ''));
  if (!phone || (await officialPhones(admin)).includes(phone) || phone === '972559895695') return { ok: false, reason: 'scanner_phone_not_dedicated' };
  const { data: usedPhone, error: pe } = await admin.from('broker_whatsapp_contacts').select('broker_id').eq('whatsapp_phone',phone).limit(1).maybeSingle();
  if (pe) throw brokerFailure('scanner_phone_check_failed', pe);
  if (usedPhone) return { ok: false, reason: 'scanner_phone_is_broker_contact' };
  const expected = `${Deno.env.get('SUPABASE_URL')}/functions/v1/broker-whatsapp-scanner-webhook`;
  const headerToken = String(settings.webhookUrlToken ?? '').replace(/^Bearer\s+/i,'');
  const webhookReady = settings.webhookUrl === expected && safeEqual(headerToken,credentials.webhook) && settings.incomingWebhook === 'yes' && settings.stateWebhook === 'yes';
  const { error: updateError } = await admin.from('broker_wa_scanner_settings').update({
    instance_id: credentials.instance, scanner_phone: phone, connected: true, webhook_ready: webhookReady,
    config_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id',true);
  if (updateError) throw brokerFailure('scanner_connection_save_failed', updateError);
  return { ok: webhookReady, reason: webhookReady ? null : 'scanner_webhook_not_configured', phone };
}

/** Both immediate webhook and bounded worker replay use this same authenticated-event path. */
export async function processScannerEvent(eventId: string, admin = adminClient()) {
  return withBrokerConnectionRetry(() => processScannerEventOnce(eventId, admin));
}

async function processScannerEventOnce(eventId: string, admin: ReturnType<typeof adminClient>) {
  const { data: event, error } = await admin.from('broker_wa_scanner_events').select('*').eq('id',eventId).single();
  if (error) throw brokerFailure('scanner_event_read_failed', error);
  if (event.status !== 'received') return;
  const { data: jobs, error: je } = await admin.from('broker_wa_scanner_jobs').select('id,source_url,provider_message_id,scanner_phone,status')
    .eq('instance_id',event.instance_id).eq('target_phone',String(event.chat_id ?? '').replace(/@c\.us$/,''))
    .in('status',['sending','awaiting_reply']).limit(50);
  if (je) throw brokerFailure('scanner_correlation_read_failed', je);
  const matches = (jobs ?? []).filter(job => job.status === 'awaiting_reply' && (
    (!!event.quoted_id && job.provider_message_id === event.quoted_id)
    || replySourceUrls(event.reply_text ?? '').includes(job.source_url)
  ));
  // Webhook may arrive before sendMessage's ID is committed. Keep it for bounded replay.
  if (!matches.length && jobs?.some(job=>job.status==='sending') && Date.now()-Date.parse(event.created_at)<120000) return;
  // Yad2's automatic reply neither quotes our message nor repeats the ad URL. With exactly one outstanding
  // inquiry on this serial line, hand it to the server, which accepts it only if the reply names that broker.
  const awaiting = (jobs ?? []).filter(job => job.status === 'awaiting_reply');
  if (!matches.length && awaiting.length === 1 && !jobs?.some(job => job.status === 'sending')) matches.push(awaiting[0]);
  if (matches.length !== 1) {
    const { error: ue } = await admin.from('broker_wa_scanner_events').update({status:'needs_manual',reason:matches.length ? 'ambiguous_message_correlation' : 'missing_message_correlation'}).eq('id',event.id).eq('status','received');
    if (ue) throw brokerFailure('scanner_event_update_failed', ue);
    return;
  }
  const job = matches[0];
  const contact = replyContact(event.reply_text ?? '', [...await officialPhones(admin),job.scanner_phone ?? '',String(event.sender ?? '').replace(/@c\.us$/,'')]);
  const { error: saveError } = await admin.rpc('complete_broker_wa_scanner_reply', { _event:event.id,_job:job.id,_phone:contact.phone,_reason:contact.reason });
  if (saveError) throw brokerFailure('scanner_reply_save_failed', saveError);
}

export function replySourceUrls(text: string) {
  return (text.match(/https:\/\/www\.yad2\.co\.il\/realestate\/item\/[a-zA-Z0-9]+(?:\?[^\s<>"']*)?/g) ?? []).map(value=>value.replace(/[),.;]+$/,''));
}

export { scannerReply };