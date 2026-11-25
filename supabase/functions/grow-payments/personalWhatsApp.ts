// After a verified 59 ILS payment, mark the personal WhatsApp request paid and
// alert the Super Admin (internal Green API alert line, same as signup alerts)
// so an instance can be created and linked manually. No automatic instance
// creation happens here.
import { resolveGreenCreds, toIntlDigits } from '../_shared/greenApiCreds.ts';
import { sendGreenApiText } from '../_shared/greenApi.ts';

const display = (p?: string | null) => p && p.startsWith('972') ? `0${p.slice(3, 5)}-${p.slice(5)}` : (p ?? '—');

// deno-lint-ignore no-explicit-any
export async function notifyPersonalWhatsAppRequest(admin: any, orderId: string) {
  const { data: request } = await admin.from('personal_whatsapp_requests').select('*').eq('order_id', orderId).maybeSingle();
  if (!request) return;
  if (request.status === 'awaiting_payment') await admin.from('personal_whatsapp_requests').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', request.id);
  if (request.admin_notified_at) return;
  const [{ data: profile }, { data: workspace }, { data: supers }] = await Promise.all([
    admin.from('profiles').select('full_name, phone').eq('id', request.user_id).maybeSingle(),
    admin.from('white_label_settings').select('agency_name').eq('user_id', request.workspace_owner_id).maybeSingle(),
    admin.from('user_roles').select('user_id').eq('role', 'super_admin'),
  ]);
  const superId = supers?.[0]?.user_id ?? null;
  const { data: superProfile } = superId ? await admin.from('profiles').select('phone').eq('id', superId).maybeSingle() : { data: null };
  const target = toIntlDigits(superProfile?.phone);
  const creds = (await resolveGreenCreds(admin, superId)) ?? (await resolveGreenCreds(admin));
  const fail = (error: string) => admin.from('personal_whatsapp_requests').update({ admin_notify_error: error, updated_at: new Date().toISOString() }).eq('id', request.id);
  if (!target || !creds) { await fail('missing_target_or_creds'); return; }
  const text = [
    'בקשה חדשה לחיבור וואטסאפ אישי (שולם 59 ₪)',
    `שם: ${profile?.full_name?.trim() || '—'}`,
    `משרד: ${workspace?.agency_name?.trim() || '—'}`,
    `טלפון החשבון: ${display(toIntlDigits(profile?.phone))}`,
    `מספר הוואטסאפ לחיבור: ${display(request.phone)}`,
    'יש ליצור ולשייך מופע לחשבון.',
  ].join('\n');
  const result = await sendGreenApiText(creds, target, text);
  if (!result.success) { await fail(String(result.error ?? 'send_failed')); return; }
  await admin.from('personal_whatsapp_requests').update({ status: 'admin_notified', admin_notified_at: new Date().toISOString(), admin_notify_error: null, updated_at: new Date().toISOString() }).eq('id', request.id);
}
