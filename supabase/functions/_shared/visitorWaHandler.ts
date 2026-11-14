import { isVisitorIntroduction, hasPropertyIdentity } from './visitorWhatsAppPolicy.ts';
import { createResponsesCall } from './visitorWaResponses.ts';
import { VISITOR_WA_PROMPT } from './visitorWaPrompt.ts';

/** Only called after a verified Meta signature or service-only internal dispatch. */
export async function isVisitorWhatsApp(admin: any, phone: string, text: string): Promise<boolean> {
  if (hasPropertyIdentity(text)) return false;
  if (isVisitorIntroduction(text)) return true;
  const { data, error } = await admin.from('visitor_whatsapp_sessions').select('phone').eq('phone', phone).maybeSingle();
  if (error) throw new Error('visitor_session_lookup_failed');
  return Boolean(data);
}

export async function handleVisitorWhatsApp(admin: any, input: {
  phone: string; name?: string | null; text: string; messageId?: string;
}, request?: Request): Promise<boolean> {
  if (!await isVisitorWhatsApp(admin, input.phone, input.text)) return false;
  const introduction = isVisitorIntroduction(input.text);
  if (!input.messageId || input.text.length > 3000 || !/^[0-9]{8,15}$/.test(input.phone)) return true;
  const { data: claim, error } = await admin.rpc('claim_visitor_whatsapp_message', {
    _phone: input.phone, _name: input.name ?? '', _text: input.text,
    _message_id: input.messageId, _introduction: introduction,
  });
  if (error) throw new Error('visitor_claim_failed');
  if (claim !== 'claimed') return claim !== 'not_visitor';
  const finish = async (values: Record<string, unknown>) => {
    const { error } = await admin.from('visitor_whatsapp_messages').update(values).eq('message_id', input.messageId).eq('phone', input.phone);
    if (error) throw new Error('visitor_result_save_failed');
  };
  // Paused access survives page reloads/process restarts; no automatic provider probes.
  const { data: blocks, error: blockError } = await admin.from('visitor_whatsapp_messages').select('message_id').eq('state', 'blocked').limit(1);
  if (blockError) throw new Error('visitor_access_check_failed');
  if (blocks?.length) { await finish({ state: 'failed', error_code: 'visitor_ai_paused' }); return true; }
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) { await finish({ state: 'failed', error_code: 'ai_configuration_missing' }); return true; }
  try {
    const { data: rows, error: historyError } = await admin.from('visitor_whatsapp_messages')
      .select('content, reply').eq('phone', input.phone).order('created_at', { ascending: false }).limit(12);
    if (historyError) throw new Error('visitor_history_failed');
    const messages = (rows ?? []).reverse().flatMap((row: { content: string; reply?: string }) => [
      { role: 'user' as const, content: row.content },
      ...(row.reply ? [{ role: 'assistant' as const, content: row.reply }] : []),
    ]);
    const call = createResponsesCall(request ?? new Request('https://toraff.co.il'), {
      baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey: key, model: 'openai/gpt-6-astra',
    }, messages, VISITOR_WA_PROMPT);
    const reply = (await call.text()).trim();
    if (!reply) { await finish({ state: 'failed', error_code: 'empty_or_refused_response' }); return true; }
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ phone_number: input.phone, message: reply.slice(0, 3900), ai_assisted: true, disclosure_language: 'he' }),
    });
    const body = await response.json().catch(() => ({}));
    await finish(response.ok && body.success === true
      ? { state: 'sent', reply }
      : { state: 'failed', error_code: `official_send_${response.status}` });
  } catch (error) {
    const status = Number((error as { statusCode?: number })?.statusCode ?? 0);
    await finish({ state: [402, 403].includes(status) ? 'blocked' : 'failed', error_code: status ? `ai_${status}` : 'visitor_reply_failed' });
    console.error('[visitor-whatsapp] reply failed', { status, phone_last4: input.phone.slice(-4) });
  }
  return true;
}