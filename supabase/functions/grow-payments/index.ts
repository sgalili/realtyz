import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, isSuperAdmin, requireCaller, safeEqual } from '../_shared/authz.ts';
import { GROW_CUSTOMER_FIELDS, GROW_PAYMENT_METHODS, GROW_SUBSCRIPTION_AMOUNT_ILS, growConfigurationReady, isMakeWebhookUrl, validGrowPaymentUrl } from '../_shared/growPayment.ts';
import { deliverPaymentSms } from './paymentSms.ts';
import { callGrowMake } from '../_shared/growMake.ts';
import { canSaveGrowCard } from '../_shared/growLeadBilling.ts';

const capabilitySchema = z.object({ methods: z.array(z.object({ id: z.enum(GROW_PAYMENT_METHODS), fields: z.array(z.enum(GROW_CUSTOMER_FIELDS)).max(4) })).max(5) });
async function capabilities(environment: string) {
  const parsed = capabilitySchema.safeParse(await callMake(environment, { action: 'capabilities', environment }));
  if (!parsed.success) throw new Error('make_capabilities_invalid');
  return parsed.data.methods;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }), z.object({ action: z.literal('test') }),
  z.object({ action: z.literal('offer') }),
  z.object({ action: z.literal('create'), payment_method: z.enum(GROW_PAYMENT_METHODS), card_mandate: z.boolean().default(false), full_name: z.string().trim().max(150).default(''), phone: z.string().regex(/^05\d{8}$/), email: z.string().max(254).optional(), national_id: z.string().max(9).optional() }),
  z.object({ action: z.literal('notify'), order_id: z.string().uuid(), transaction_id: z.string().min(1).max(128) }),
]);

// This is a Make scenario contract, not a raw Grow API payload. The scenario
// handles Grow connection/OTP, creation, status retrieval and acknowledgment.
const callMake = callGrowMake;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let stage = 'validate';
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'invalid_request', details: parsed.error.flatten() }, 400);
    const body = parsed.data;
    const admin = adminClient();
    if (body.action === 'notify') {
      // Make authenticates to TORAFF using a separate shared secret; no JWT or
      // browser redirect is accepted as payment proof.
      const expected = Deno.env.get('GROW_MAKE_NOTIFY_SECRET') ?? '';
      if (!expected || !safeEqual(req.headers.get('x-grow-notify-secret') ?? '', expected)) return json({ error: 'unauthorized' }, 401);
      const { data: order, error } = await admin.from('grow_payment_orders').select('*').eq('id', body.order_id).single();
      if (error || !order) return json({ error: 'order_not_found' }, 404);
      stage = 'verify_payment';
      // Independent provider readback through Make, never trust notification amounts.
      const verified = z.object({ paid: z.literal(true), order_id: z.string().uuid(), transaction_id: z.string(), amount_ils: z.number(), currency: z.literal('ILS'), environment: z.enum(['live','sandbox']) }).safeParse(await callMake(order.environment, { action: 'verify', order_id: order.id, transaction_id: body.transaction_id }));
      if (!verified.success || verified.data.order_id !== order.id || verified.data.transaction_id !== body.transaction_id || verified.data.amount_ils !== Number(order.amount_ils) || verified.data.environment !== order.environment) return json({ error: 'payment_not_verified' }, 409);
      const { data: completed, error: completeError } = await admin.rpc('complete_grow_payment', { _order_id: order.id, _transaction_id: body.transaction_id, _amount_ils: verified.data.amount_ils, _environment: order.environment });
      if (completeError) return json({ error: 'payment_completion_failed' }, 409);
      if (canSaveGrowCard({ ...order, status: 'paid' })) {
        stage = 'save_card_reference';
        // The actual card token remains in Grow/Make's vault. Only a scoped
        // opaque lookup reference and display metadata enter TORAFF.
        const card = z.object({ order_id: z.string().uuid(), customer_id: z.string().uuid(), environment: z.literal('live'), vault_reference: z.string().min(1).max(200), last4: z.string().regex(/^\d{4}$/), brand: z.string().max(30) }).safeParse(await callMake(order.environment, { action: 'card_reference', order_id: order.id, customer_id: order.user_id }));
        if (!card.success || card.data.order_id !== order.id || card.data.customer_id !== order.user_id) return json({ error: 'card_reference_not_verified', recorded: true }, 502);
        const { error: cardError } = await admin.rpc('save_grow_card_reference', { _order_id: order.id, _reference: card.data.vault_reference, _last4: card.data.last4, _brand: card.data.brand });
        if (cardError) return json({ error: 'card_reference_save_failed', recorded: true }, 502);
      }
      await deliverPaymentSms(admin, order.id);
      stage = 'acknowledge';
      const acknowledged = await callMake(order.environment, { action: 'approve', order_id: order.id, transaction_id: body.transaction_id });
      if (acknowledged?.approved !== true) return json({ error: 'notification_acknowledgment_failed', recorded: true }, 502);
      return json(completed);
    }
    const caller = await requireCaller(req, ['user']);
    if (caller instanceof Response) return caller;
    if (caller.kind !== 'user') return json({ error: 'unauthorized' }, 401);
    const superAdmin = await isSuperAdmin(caller.userId, admin);
    if ((body.action === 'status' || body.action === 'test') && !superAdmin) return json({ error: 'forbidden' }, 403);
    const { data: settings, error: settingsError } = await admin.from('grow_payment_settings').select('*').eq('id', true).maybeSingle();
    if (settingsError) return json({ error: 'settings_unavailable' }, 503);
    const environment = settings?.environment ?? 'sandbox';
    const prefix = environment === 'live' ? 'GROW_MAKE_LIVE' : 'GROW_MAKE_SANDBOX';
    if (body.action === 'offer') {
      const ready = settings && growConfigurationReady(settings) && Deno.env.get(`${prefix}_URL`) && Deno.env.get(`${prefix}_API_KEY`) && Deno.env.get('GROW_MAKE_NOTIFY_SECRET');
      return json({ offer: ready ? { title: settings.subscription_title, benefits: settings.benefits, duration_days: settings.duration_days, amount_ils: GROW_SUBSCRIPTION_AMOUNT_ILS, environment, methods: await capabilities(environment) } : null });
    }
    if (body.action === 'status') return json({ configured: Boolean(Deno.env.get(`${prefix}_URL`) && Deno.env.get(`${prefix}_API_KEY`) && Deno.env.get('GROW_MAKE_NOTIFY_SECRET')), environment, terms_ready: growConfigurationReady(settings ?? {}) });
    if (body.action === 'test') {
      stage = 'test_connection';
      const result = await callMake(environment, { action: 'test', environment });
      if (result?.connected !== true || result?.environment !== environment) return json({ error: 'connection_not_verified' }, 502);
      return json({ connected: true, environment });
    }
    if (!settings || !growConfigurationReady(settings) || !Deno.env.get('GROW_MAKE_NOTIFY_SECRET')) return json({ error: 'subscription_not_configured' }, 409);
    const method = (await capabilities(environment)).find(m => m.id === body.payment_method);
    if (!method) return json({ error: 'payment_method_unavailable' }, 409);
    for (const field of method.fields) {
      const value = body[field];
      if (!value?.trim() || (field === 'email' && !z.string().email().safeParse(value).success) || (field === 'national_id' && !/^\d{9}$/.test(value)) || (field === 'full_name' && value.trim().split(/\s+/).length < 2)) return json({ error: 'invalid_customer_field', field }, 400);
    }
    stage = 'create_order';
    const { data: order, error } = await admin.from('grow_payment_orders').insert({ user_id: caller.userId, environment, amount_ils: GROW_SUBSCRIPTION_AMOUNT_ILS, duration_days: settings.duration_days, title: settings.subscription_title, benefits: settings.benefits, customer_phone: body.phone, payment_method: body.payment_method, card_mandate: body.payment_method === 'card' && body.card_mandate, mandate_at: body.payment_method === 'card' && body.card_mandate ? new Date().toISOString() : null }).select('id').single();
    if (error || !order) return json({ error: 'order_creation_failed' }, 503);
    try {
      stage = 'create_link';
      const customer = Object.fromEntries(method.fields.map(field => [field, body[field]]));
      const result = await callMake(environment, { action: 'create', order_id: order.id, environment, amount_ils: GROW_SUBSCRIPTION_AMOUNT_ILS, currency: 'ILS', title: settings.subscription_title, ...customer, phone: body.phone, payment_method: body.payment_method, save_card_token: body.payment_method === 'card' && body.card_mandate, sending_mode: settings.sending_mode, payment_type: 'payments', charge_type: 'regular charge', success_url: `${Deno.env.get('PUBLIC_SITE_URL') ?? 'https://toraff.co.il'}/wallet` });
      if (typeof result?.payment_url !== 'string' || !validGrowPaymentUrl(result.payment_url)) throw new Error('invalid_payment_url');
      const { error: saveError } = await admin.from('grow_payment_orders').update({ status: 'link_ready', payment_url: result.payment_url }).eq('id', order.id).eq('status', 'pending');
      if (saveError) throw new Error('payment_link_save_failed');
      return json({ order_id: order.id, payment_url: result.payment_url, environment });
    } catch (e) {
      // A timed-out Make call may still create the link. Keep the order payable
      // so a later independently verified provider notification can complete it.
      throw e;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    const safe = /^(make_|invalid_payment_url|payment_link_save_failed)/.test(message) ? message : 'payment_service_unavailable';
    console.error('[grow-payments]', stage, safe);
    return json({ error: safe, stage }, 502);
  }
});