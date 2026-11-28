import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeRitaPhone, concisePublicText } from './ritaVoice';
import type { RitaAdmin } from './ritaVoiceSecurity.server';

export const ritaWhatsappLinksSchema = z.object({
  rita_call_context_id: z.string().uuid(),
  lead_phone: z.string().min(7).max(40),
  first_name: z.string().trim().max(80).optional(),
  property_ids: z.array(z.string().uuid()).min(1).max(3),
  confirmed: z.literal(true),
}).strict();

export function authorizeRitaLinkRequest(context: { lead_phone: string | null; workspace_owner_id: string | null; status: string; dynamic_variables: unknown; source_context: unknown }, input: z.infer<typeof ritaWhatsappLinksSchema>) {
  const variables = (context.dynamic_variables ?? {}) as Record<string, unknown>;
  const source = (context.source_context ?? {}) as Record<string, unknown>;
  if (!context.workspace_owner_id || !['active', 'pending', 'initiated', 'queued'].includes(context.status)) throw new Error('Invalid active call context');
  if (variables['is_test_call'] === true || variables['is_test_call'] === 'true') throw new Error('Invalid: test calls cannot send WhatsApp messages');
  const phone = normalizeRitaPhone(context.lead_phone);
  if (!phone || normalizeRitaPhone(input.lead_phone) !== phone) throw new Error('Invalid caller phone');
  const matched = Array.isArray(source['searched_property_ids']) ? source['searched_property_ids'] : [];
  if (input.property_ids.some(id => !matched.includes(id))) throw new Error('Invalid: property was not returned by this call search');
  return phone;
}

export function buildRitaPropertyLinksMessage(name: string, rows: Array<{ id: string; title: string; price: number | null; deal_type: string }>): string {
  return [`שלום${name ? ` ${concisePublicText(name, 80)}` : ''}, כאן ריטה מטוֹרָאף.`, 'בהמשך לבקשה בשיחה, אלו הקישורים לנכסים שעליהם דיברנו:', '',
    ...rows.flatMap((row, index) => [`${index + 1}. ${row.title}`, row.price ? `מחיר: ₪${row.price.toLocaleString('he-IL')}${row.deal_type === 'rent' ? ' לחודש' : ''}` : 'מחיר לא צוין', `https://toraff.co.il/p/${row.id}`, ''])].join('\n').trim();
}

async function approvedLinkTemplate(admin: RitaAdmin): Promise<boolean> {
  const providers = await admin.from('wa_providers').select('config').eq('provider_name', 'WBA').eq('is_official', true).eq('is_active', true).order('updated_at', { ascending: false }).limit(10);
  if (providers.error) throw providers.error;
  const config = providers.data?.map(row => row.config as Record<string, unknown>).find(row => row['waba_id'] && row['access_token']);
  if (!config) return false;
  const url = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(String(config['waba_id']))}/message_templates`);
  url.searchParams.set('name', 'rita_property_links_v1'); url.searchParams.set('fields', 'name,status,language,components');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${String(config['access_token'])}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    const raw = await response.text();
    console.error('Meta template validation failed', response.status, raw.replaceAll(String(config['access_token']), '[redacted]').slice(0, 1000));
    throw new Error(`WhatsApp template validation ${response.status}`);
  }
  const body = await response.json() as { data?: Array<{ name: string; status: string; language: string; components?: Array<{type: string; text?: string}> }> };
  return body.data?.some(template => template.name === 'rita_property_links_v1' && template.status === 'APPROVED' && template.language === 'he' && template.components?.some(component => component.type === 'BODY' && component.text?.includes('{{1}}') && component.text.includes('{{2}}') && !component.text.includes('{{3}}'))) ?? false;
}

export async function sendRitaWhatsappLinks(admin: RitaAdmin, raw: unknown) {
  const input = ritaWhatsappLinksSchema.parse(raw);
  const { data: context, error: contextError } = await admin.from('rita_call_contexts').select('*').eq('id', input.rita_call_context_id).single();
  if (contextError || !context) throw new Error('Missing call context');
  const phone = authorizeRitaLinkRequest(context, input);
  const ids = [...new Set(input.property_ids)].sort();
  const { data: properties, error } = await admin.from('listings').select('id,property_title,address,asking_price,deal_type')
    .in('id', ids).eq('status', 'live').is('canonical_duplicate_of', null).or('is_published.eq.true,affiliate_enabled.eq.true').limit(3);
  if (error) throw error;
  if (properties?.length !== ids.length) throw new Error('Invalid: property is no longer public');
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Official WhatsApp server configuration missing');
  const windowCheck = await admin.rpc('rita_whatsapp_service_window', { _phone: phone, _context_id: context.id });
  if (windowCheck.error) throw windowCheck.error;
  const useTemplate = !windowCheck.data;
  if (useTemplate && !await approvedLinkTemplate(admin)) return { success: false, status: 'template_required', message: 'תבנית קישורי הנכסים עדיין ממתינה לאישור WhatsApp. אפשר לשלוח הודעה למספר הרשמי כדי לפתוח את השיחה, ואז ניתן לשלוח את הקישורים.' };
  const name = context.full_name?.trim().split(/\s+/)[0] || input.first_name || '';
  const message = buildRitaPropertyLinksMessage(name, properties.map(row => ({ id: row.id, title: concisePublicText(row.property_title || row.address, 140), price: row.asking_price, deal_type: row.deal_type || '' })));
  const templateBundle = properties.map(row => `${concisePublicText(row.property_title || row.address, 65)}, ₪${Number(row.asking_price || 0).toLocaleString('he-IL')}${row.deal_type === 'rent' ? ' לחודש' : ''}, https://toraff.co.il/p/${row.id}`).join('; ');
  const dedupe = createHash('sha256').update(`${context.id}:${ids.join(',')}`).digest('hex');
  const claim = await admin.from('rita_whatsapp_link_sends').insert({ context_id: context.id, workspace_owner_id: context.workspace_owner_id ?? '', dedupe_key: dedupe, property_ids: ids, phone_number: phone, message }).select('id').single();
  if (claim.error) {
    if (claim.error.code !== '23505') throw claim.error;
    const existing = await admin.from('rita_whatsapp_link_sends').select('status,error').eq('dedupe_key', dedupe).single();
    if (existing.error) throw existing.error;
    return { success: ['accepted', 'sent', 'delivered', 'read'].includes(existing.data.status), status: existing.data.status, duplicate: true, message: existing.data.error || 'הבקשה כבר טופלה ולא נשלחה שוב.' };
  }
  let status: 'accepted' | 'failed' | 'unknown' = 'unknown';
  let providerId: string | null = null;
  let failure: string | null = null;
  try {
    // Reuse the configured official sender, never the personal/scanner lane.
    // Do not pass lead_id: the durable call-linked record owns this action.
    const response = await fetch(`${url}/functions/v1/send-whatsapp`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, tenant_id: context.workspace_owner_id, message, force_official: true, ...(useTemplate ? { template_id: 'rita_property_links_v1', template_language: 'he', template_components: [{ type: 'body', parameters: [{ type: 'text', text: name || 'שלום' }, { type: 'text', text: templateBundle }] }] } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    const rawBody = await response.text();
    let result: Record<string, unknown>;
    try { result = JSON.parse(rawBody); } catch { throw new Error(`Official WhatsApp returned ${response.status} without a valid result`); }
    if (response.ok && result['success'] === true && result['provider'] === 'WBA' && typeof result['message_id'] === 'string') {
      status = 'accepted'; providerId = result['message_id'];
    } else {
      // A transport/server failure may have happened after sending. Never replay.
      const details = result['details'] && typeof result['details'] === 'object' ? result['details'] as Record<string, unknown> : {};
      status = response.status >= 500 && details['code'] == null ? 'unknown' : 'failed';
      failure = `WhatsApp ${response.status}: ${String(result['error'] || 'No accepted message ID').slice(0, 1000)}`;
    }
  } catch (error) { failure = error instanceof Error ? error.message : 'Unknown WhatsApp outcome'; }
  const finished = await admin.rpc('finish_rita_whatsapp_links', { _id: claim.data.id, _status: status, ...(!providerId ? {} : { _provider_id: providerId }), ...(!failure ? {} : { _error: failure }) });
  if (finished.error) throw finished.error;
  const readback = await admin.from('rita_whatsapp_link_sends').select('status').eq('id', claim.data.id).single();
  if (readback.error) throw readback.error;
  return { success: ['accepted', 'sent', 'delivered', 'read'].includes(readback.data.status), status: readback.data.status, message: failure || 'הקישורים הועברו לשליחה בוואטסאפ. אישור מסירה עדיין נבדק.' };
}