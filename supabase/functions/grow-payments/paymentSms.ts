import { adminClient } from '../_shared/authz.ts';
import { sendSms019 } from '../_shared/sms019.ts';
import { paymentSmsEligible, paymentSmsSummary } from '../_shared/growPayment.ts';

// Pending rows survive callback failures. Ambiguous provider delivery is never
// blindly retried: 019 does not expose an idempotency key for this API.
export async function deliverPaymentSms(admin: ReturnType<typeof adminClient>, orderId: string) {
  const { data: order, error } = await admin.from('grow_payment_orders').select('id,title,amount_ils,status,environment,customer_phone').eq('id', orderId).single();
  if (error || !order || !paymentSmsEligible(order)) return;
  const { data: claimed, error: claimError } = await admin.rpc('claim_payment_sms', { _order_id: orderId });
  if (claimError || claimed !== true) return;
  try {
    const result = await sendSms019(admin, order.customer_phone ?? '', paymentSmsSummary(order), null);
    const { error: saveError } = await admin.from('payment_sms_outbox').update({ status: result.ok ? 'sent' : 'uncertain', provider_message_id: result.message_id ?? null, last_error: result.ok ? null : 'sms_provider_rejected', sent_at: result.ok ? new Date().toISOString() : null }).eq('order_id', orderId).eq('status', 'sending');
    if (saveError || !result.ok) console.error('[payment-sms] delivery requires review', { order_id: orderId, recorded: !saveError });
  } catch {
    await admin.from('payment_sms_outbox').update({ status: 'uncertain', last_error: 'sms_delivery_unknown' }).eq('order_id', orderId).eq('status', 'sending');
    console.error('[payment-sms] delivery unknown', { order_id: orderId });
  }
}