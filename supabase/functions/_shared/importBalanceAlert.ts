import { brightDataBalanceExhausted } from './brightDataBalance.ts';

// Keep the pure alert flow testable without importing a Deno-only authorization module.
type AlertAdmin = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Called only after a fenced import error was saved. Alert failures never block import checkpoints. */
export async function alertImportBalance(admin: AlertAdmin, jobId: string, status: number | undefined, message: string) {
  if (!brightDataBalanceExhausted(status, message)) return;
  try {
    const { data: roles, error } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin');
    if (error) throw error;
    for (const recipient of roles ?? []) {
      const { data: claimed, error: claimError } = await admin.rpc('claim_import_balance_alert', { _recipient: recipient.user_id, _job: jobId });
      if (claimError) throw claimError;
      if (!claimed) continue;
      const text = 'יתרת Bright Data אזלה. יש להטעין קרדיטים ב־Bright Data כדי להמשיך באיתור ובייבוא מתווכים, יזמים ונכסים. ההתקדמות שכבר נשמרה לא נמחקה.';
      const { data: profile, error: profileError } = await admin.from('profiles').select('phone').eq('id', recipient.user_id).maybeSingle();
      if (profileError) throw profileError;
      const { data: notification, error: notificationError } = await admin.from('notifications').insert({ user_id: recipient.user_id, event_type: 'brightdata_balance', title: 'נדרשת טעינת Bright Data', body: text, deep_link: '/super-admin?section=import', channel: 'whatsapp', delivered: false }).select('id').single();
      if (notificationError) throw notificationError;
      let result: Record<string, unknown> = { skipped: 'missing_super_admin_phone' };
      if (profile?.phone) {
        // Reuse the official sender, not Green's dedicated discovery line or a personal connection.
        const env = (globalThis as unknown as { Deno: { env: { get: (key: string) => string | undefined } } }).Deno.env;
        const key = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const response = await fetch(`${env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone_number: profile.phone, tenant_id: recipient.user_id, message: text, force_official: true }), signal: AbortSignal.timeout(10000) });
        const body = await response.json().catch(() => ({}));
        result = { status: response.status, accepted: response.ok && body.success === true, provider_message_id: body.message_id ?? null, error: body.error ?? null, details: body.details ?? null };
        if (!response.ok || body.success !== true) console.error('[import-balance-alert-send]', JSON.stringify({ status: response.status, error: body.error, details: body.details }));
      }
      const { error: updateError } = await admin.from('import_balance_alerts').update({ notification_id: notification?.id, result }).eq('recipient_id', recipient.user_id).eq('job_id', jobId);
      if (updateError) throw updateError;
      const { error: deliveryError } = await admin.from('notifications').update({ delivery_result: result }).eq('id', notification?.id);
      if (deliveryError) throw deliveryError;
    }
  } catch (error) { console.error('[import-balance-alert]', error instanceof Error ? error.message : 'alert_failed'); }
}