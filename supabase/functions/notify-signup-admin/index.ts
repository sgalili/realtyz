// Sends the Super Admin a one-time WhatsApp (Green API) alert about a new signup.
// The caller can only trigger the alert for their own account; it is sent once per user.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveGreenCreds, fetchGreenAvatar, toIntlDigits } from '../_shared/greenApiCreds.ts';
import { sendGreenApiText, sendGreenApiFileByUrl } from '../_shared/greenApi.ts';

const TYPE_LABELS: Record<string, string> = {
  broker: 'מתווך', developer: 'יזם', property_owner: 'בעל נכס', property_seeker: 'מחפש נכס',
  affiliate: 'שותף', partner: 'שותף', agent: 'סוכן', managing_broker: 'מתווך מנהל', user: 'משתמש',
};
const PRIORITY = ['developer', 'managing_broker', 'broker', 'property_owner', 'property_seeker', 'affiliate', 'agent', 'user'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) return json({ error: 'unauthorized' }, 401);
    const uid = auth.user.id;

    // Claim once per user.
    const { error: claimErr } = await admin.from('signup_admin_alerts').insert({ user_id: uid });
    if (claimErr) return json({ ok: true, skipped: 'already_sent' });

    const [{ data: profile }, { data: roles }, { data: supers }] = await Promise.all([
      admin.from('profiles').select('full_name, phone').eq('id', uid).maybeSingle(),
      admin.from('user_roles').select('role').eq('user_id', uid),
      admin.from('user_roles').select('user_id').eq('role', 'super_admin'),
    ]);
    const roleSet = (roles ?? []).map((r: any) => String(r.role));
    if (roleSet.includes('super_admin')) {
      await admin.from('signup_admin_alerts').update({ status: 'skipped' }).eq('user_id', uid);
      return json({ ok: true, skipped: 'super_admin' });
    }
    const main = PRIORITY.find((r) => roleSet.includes(r));
    const typeLabel = main ? TYPE_LABELS[main] : 'לא נבחר';
    const phone = toIntlDigits(profile?.phone ?? auth.user.phone ?? auth.user.user_metadata?.phone_number);
    const displayPhone = phone && phone.startsWith('972') ? `0${phone.slice(3, 5)}-${phone.slice(5)}` : (phone ?? '—');

    const superId = supers?.[0]?.user_id ?? null;
    const { data: superProfile } = superId
      ? await admin.from('profiles').select('phone').eq('id', superId).maybeSingle()
      : { data: null };
    const target = toIntlDigits(superProfile?.phone);
    const creds = (await resolveGreenCreds(admin, superId)) ?? (await resolveGreenCreds(admin));
    if (!target || !creds) {
      await admin.from('signup_admin_alerts').update({ status: 'failed', error: 'missing_target_or_creds' }).eq('user_id', uid);
      return json({ ok: false, error: 'not_configured' });
    }

    const avatar = phone ? await fetchGreenAvatar(creds, phone).catch(() => null) : null;
    const text = [
      '🆕 נרשם משתמש חדש ל-TORAFF',
      `שם מלא: ${profile?.full_name?.trim() || '—'}`,
      `סוג משתמש: ${typeLabel}`,
      `מספר טלפון: ${displayPhone}`,
      avatar ? '' : 'תמונת פרופיל: לא זמינה',
    ].filter(Boolean).join('\n');

    const result = avatar
      ? await sendGreenApiFileByUrl(creds, target, avatar, 'profile.jpg', text)
      : await sendGreenApiText(creds, target, text);
    const final = result.success || !avatar ? result : await sendGreenApiText(creds, target, text);
    await admin.from('signup_admin_alerts')
      .update({ status: final.success ? 'sent' : 'failed', error: final.success ? null : String(final.error ?? '') })
      .eq('user_id', uid);
    return json({ ok: final.success });
  } catch (e) {
    console.error('notify-signup-admin failed', e);
    return json({ error: 'internal' }, 500);
  }
});
