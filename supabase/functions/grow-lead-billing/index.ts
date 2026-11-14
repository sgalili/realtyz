import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, requireCaller } from '../_shared/authz.ts';
import { callGrowMake } from '../_shared/growMake.ts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const caller = await requireCaller(req, ['service', 'cron']);
  if (caller instanceof Response) return caller;
  const parsed = z.object({ action: z.literal('authorize'), job_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_request' }, 400);
  const admin = adminClient();
  const { data: job, error } = await admin.from('grow_lead_authorizations').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', parsed.data.job_id).eq('status', 'pending').select('*').maybeSingle();
  if (error) return json({ error: 'claim_failed' }, 503);
  if (!job) return json({ duplicate: true });
  const finish = async (status: string, errorCode: string | null, extra = {}) => {
    const { error } = await admin.from('grow_lead_authorizations').update({ status, error_code: errorCode, updated_at: new Date().toISOString(), ...extra }).eq('id', job.id).eq('status', 'processing');
    if (error) throw new Error('authorization_save_failed');
  };
  try {
    const { data: card, error: cardError } = await admin.from('grow_saved_cards').select('vault_reference,order_id').eq('workspace_owner_id', job.workspace_owner_id).is('revoked_at', null).maybeSingle();
    if (cardError || !card) { await finish('unavailable', 'no_card_mandate'); return json({ skipped: true }); }
    const caps = await callGrowMake('live', { action: 'billing_capabilities', environment: 'live' });
    // Never use a regular charge as a substitute for issuer authorization.
    if (caps?.token_preauthorization !== true || caps?.idempotent_operations !== true || caps?.authorization_release !== true) { await finish('unavailable', 'preauthorization_not_supported'); return json({ unavailable: true }); }
    const result = z.object({ authorized: z.boolean(), customer_id: z.string().uuid(), operation_id: z.string().uuid(), amount_ils: z.number(), currency: z.literal('ILS'), environment: z.literal('live'), authorization_reference: z.string().max(200).optional(), expires_at: z.string().datetime().optional() }).safeParse(await callGrowMake('live', { action: 'preauthorize', operation_id: job.id, customer_id: job.workspace_owner_id, vault_reference: card.vault_reference, amount_ils: Number(job.amount_ils), currency: 'ILS', release_after_check: true }));
    if (!result.success || result.data.customer_id !== job.workspace_owner_id || result.data.operation_id !== job.id || result.data.amount_ils !== Number(job.amount_ils)) throw new Error('authorization_not_verified');
    const { data: stillActive } = await admin.from('grow_saved_cards').select('order_id').eq('workspace_owner_id', job.workspace_owner_id).is('revoked_at', null).maybeSingle();
    if (!stillActive || stillActive.order_id !== card.order_id) { await finish('superseded', 'mandate_changed'); return json({ skipped: true }); }
    // This is a point-in-time issuer check, not a guaranteed remaining credit limit.
    await finish(result.data.authorized ? 'verified' : 'declined', result.data.authorized ? null : 'issuer_declined', { provider_reference: result.data.authorization_reference ?? null, expires_at: result.data.expires_at ?? null });
    return json({ ok: true });
  } catch {
    await finish('uncertain', 'provider_or_readback_failed').catch(() => undefined);
    console.error('[grow-lead-billing] authorization unresolved', { job_id: job.id });
    return json({ error: 'authorization_unresolved' }, 502);
  }
});