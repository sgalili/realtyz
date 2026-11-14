import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, requireCaller } from '../_shared/authz.ts';
import { FIRST_CONTACT_TEMPLATE, firstContactTemplateReady, contactFirstName } from '../_shared/leadFirstWhatsapp.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user') return json({ error: 'unauthorized' }, 401);
  const parsed = z.object({ lead_id: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_lead_id' }, 400);
  try {
    const admin = adminClient();
    const scoped = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: `Bearer ${caller.token}` } } });
    const { data: owner, error: ownerError } = await scoped.rpc('current_workspace_owner');
    if (ownerError || !owner) return json({ error: 'workspace_required' }, 403);
    const { data: lead, error: leadError } = await scoped.from('leads').select('id,full_name,phone_number,workspace_owner_id').eq('id', parsed.data.lead_id).eq('workspace_owner_id', owner).maybeSingle();
    if (leadError || !lead) return json({ error: 'lead_not_authorized' }, 403);
    if (!/^9725\d{8}$/.test(lead.phone_number ?? '')) return json({ error: 'invalid_phone' }, 400);
    const { data: history, error: historyError } = await scoped.from('messages').select('id').eq('lead_id', lead.id).eq('channel', 'whatsapp').limit(1);
    if (historyError) return json({ error: 'history_check_failed' }, 503);
    if (history?.length) return json({ success: true, skipped: 'existing_conversation' });
    const { data: template } = await admin.from('wa_message_templates').select('name,language,status,body_text,variable_count,has_header_variable').eq('owner_user_id', owner).eq('name', FIRST_CONTACT_TEMPLATE).eq('language', 'he').maybeSingle();
    if (!firstContactTemplateReady(template)) return json({ error: 'approved_opt_in_template_required' });
    const firstName = contactFirstName(lead.full_name ?? '');
    if (!firstName) return json({ error: 'first_name_required' }, 400);
    const { error: claimError } = await admin.from('lead_first_whatsapp_claims').insert({ workspace_owner_id: owner, phone_number: lead.phone_number, lead_id: lead.id });
    if (claimError?.code === '23505') return json({ success: true, skipped: 'already_attempted' });
    if (claimError) return json({ error: 'claim_failed' }, 503);
    const patch = (status: string, message_id: string | null = null) => admin.from('lead_first_whatsapp_claims').update({ status, message_id }).eq('workspace_owner_id', owner).eq('phone_number', lead.phone_number);
    try {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`, {
        method: 'POST', headers: { Authorization: `Bearer ${caller.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, tenant_id: owner, force_official: true, template_id: FIRST_CONTACT_TEMPLATE, template_language: 'he', message: template?.body_text.replace('{{1}}', firstName), template_components: [{ type: 'body', parameters: [{ type: 'text', text: firstName }] }] }),
        signal: AbortSignal.timeout(45000),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        await patch(result.skipped ? 'failed' : 'unknown');
        return json({ error: result.error ?? result.skipped ?? 'provider_send_failed', status: response.status, details: result.details ?? null });
      }
      await patch('sent', result.message_id ?? null);
      return json({ success: true, message_id: result.message_id });
    } catch {
      await patch('unknown');
      return json({ error: 'delivery_unknown_no_automatic_retry' });
    }
  } catch {
    return json({ error: 'first_contact_unavailable' }, 503);
  }
});