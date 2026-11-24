import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.25.76';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { brokerFirstName, propertyExample, BROKER_EMAIL_BATCH_MAX } from '../_shared/brokerInvitationEmail.ts';
import { loadAttachment, attachmentBase64, markAttachmentSent } from '../_shared/invitationAttachment.ts';
import { demoInvitationLink, demoTypeForRoles, invitationLink, publicSiteOrigin } from '../_shared/importInvitationPolicy.ts';
import { coldInvitationBody, firstContactBody, fillFirstContact } from '../_shared/brokerInvitationTemplate.ts';

const OFFICIAL_WA = '972537983832';
const waStart = (firstName: string) => `https://wa.me/${OFFICIAL_WA}?text=${encodeURIComponent(`היי, כאן ${firstName || 'מתווך'}. אשמח לשמוע עוד על TORAFF`)}`;

// Email only to brokers whose consent a Super Admin recorded; never to scraped contacts without consent.
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('summary') }),
  z.object({ action: z.literal('consent'), broker_id: z.string().uuid(), note: z.string().trim().min(3).max(300), revoke: z.boolean().optional() }),
  z.object({ action: z.literal('send_batch'), broker_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(BROKER_EMAIL_BATCH_MAX).default(BROKER_EMAIL_BATCH_MAX), message: z.string().trim().min(10).max(4000).optional(), demo: z.boolean().optional(), subject: z.string().trim().min(1).max(200).optional(), attachment_id: z.string().uuid().nullable().optional(), outreach:z.boolean().default(false), first_contact: z.boolean().default(false) }),
]);
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const escHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
// Super Admin-edited body: escaped plain text only, always followed by the selected demo/sign-in link and unsubscribe.
const customEmailHtml = (msg: string, link: string, unsubscribeUrl: string, demo: boolean) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 22px;text-align:right;line-height:1.7;font-size:16px"><div style="font-weight:700;font-size:20px;color:#0f2a4a;margin-bottom:18px">TORAFF</div>${msg.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}<p style="margin:8px 0 26px"><a href="${escHtml(link)}" style="display:inline-block;background:${link.startsWith('https://wa.me/') ? '#16a34a' : '#1d4ed8'};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700">${link.startsWith('https://wa.me/') ? 'שליחת הודעה בוואטסאפ' : demo ? 'לחצו כאן לצפייה במרחב ההדגמה' : 'לחצו כאן כדי לצפות'}</a></p><p style="margin:0;color:#6b7280;font-size:13px"><a href="${escHtml(unsubscribeUrl)}" style="color:#6b7280">הסרה מרשימת התפוצה</a></p></div></body></html>`;
const page = (msg: string) => new Response(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px">${msg}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  const url = new URL(req.url);
  const unsub = url.searchParams.get('unsubscribe');
  if (unsub) {
    if (!/^[0-9a-f-]{36}$/i.test(unsub)) return page('קישור לא תקין');
    const { error } = await admin.from('admin_broker_onboarding').update({ email_unsubscribed_at: new Date().toISOString() }).eq('email_unsubscribe_token', unsub).is('email_unsubscribed_at', null);
    return page(error ? 'ההסרה נכשלה, נסו שוב' : 'הוסרת מרשימת התפוצה של TORAFF. לא יישלחו אליך הודעות נוספות.');
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId)) return json({ error: 'Super Admin required' }, 403);
  let parsed; try { parsed = schema.safeParse(await req.json()); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;

  if (input.action === 'consent') {
    const patch = input.revoke ? { email_consent_at: null, email_consent_by: null, email_consent_note: null } : { email_consent_at: new Date().toISOString(), email_consent_by: caller.userId, email_consent_note: input.note };
    const { data, error } = await admin.from('admin_broker_onboarding').update(patch).eq('user_id', input.broker_id).select('user_id').maybeSingle();
    if (error || !data) return json({ error: 'המתווך אינו בתהליך הצטרפות' }, 404);
    return json({ success: true });
  }

  const { data: rows, error } = await admin.from('admin_broker_onboarding').select('user_id,email_unsubscribe_token,invitation_link_token').not('email_consent_at', 'is', null).is('email_unsubscribed_at', null).is('email_invited_at', null).is('first_invitation_at', null).is('first_login_at', null).limit(500);
  if (error) return json({ error: 'קריאת רשימת המתווכים נכשלה' }, 500);
  const ids = (rows ?? []).map(r => r.user_id);
  const { data: profiles } = ids.length ? await admin.from('profiles').select('id,full_name,email,gender').in('id', ids) : { data: [] };
  const eligible = (() => { const pBy = new Map((profiles ?? []).map(p => [p.id, p])); return (rows ?? []).map(r => ({ ...r, p: pBy.get(r.user_id) })); })().filter(r => r.p?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.p.email) && !r.p.email.endsWith('.invalid'));
  if (input.action === 'summary') return json({ eligible: eligible.length, batch_max: BROKER_EMAIL_BATCH_MAX });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY'); const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) return json({ error: 'חיבור Resend אינו מוגדר' }, 503);
  const site = new URL(publicSiteOrigin());
  const fnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/admin-broker-email-invitation`;
  let attachments: { filename: string; content: string }[] | undefined; let attachmentId: string | null = null;
  if (input.attachment_id) { try { const a = await loadAttachment(admin, input.attachment_id); if (a) { attachments = [{ filename: a.file_name, content: await attachmentBase64(admin, a) }]; attachmentId = a.id; } } catch (e) { return json({ error: e instanceof Error ? e.message : 'הקובץ המצורף אינו זמין' }, 400); } }
  const attachLink = attachments ? [{ label: `קובץ מצורף: ${attachments[0].filename}`, url: '' }] : [];
  const targets = input.broker_id ? eligible.filter(r => r.user_id === input.broker_id) : eligible;
  if (input.broker_id && !targets.length) return json({ error: 'המתווך אינו זמין לשליחה: נדרשת הסכמה מתועדת וכתובת אימייל תקינה' }, 400);
  const results: { broker_id: string; status: string; error?: string }[] = [];
  for (const r of targets.slice(0, input.limit)) {
    if(input.outreach){const {data:j,error:je}=await admin.from('broker_outreach_journeys').select('enabled,message_consent_at,opted_out_at').eq('broker_id',r.user_id).maybeSingle();if(je||!j?.enabled||!j.message_consent_at||j.opted_out_at){results.push({broker_id:r.user_id,status:'skipped'});continue;}}
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(r.user_id);
    if (accountError || !account.user || account.user.last_sign_in_at) { results.push({ broker_id: r.user_id, status: 'skipped' }); continue; }
    // Claim first so a retry or parallel click never sends twice.
    const now = new Date().toISOString();
    const { data: claimed } = await admin.from('admin_broker_onboarding').update({ email_invited_at: now }).eq('user_id', r.user_id).is('email_invited_at', null).is('first_invitation_at', null).is('first_login_at', null).select('user_id').maybeSingle();
    if (!claimed) { results.push({ broker_id: r.user_id, status: 'skipped' }); continue; }
    const { data: listings } = await admin.from('listings').select('property_title,address,city,deal_type').eq('workspace_owner_id', r.user_id).not('status', 'in', '(removed,sold,discarded)').order('created_at', { ascending: false }).limit(10);
    const examples = (listings ?? []).map(propertyExample).filter((v): v is string => !!v).slice(0, 2);
    const unsubscribeUrl = `${fnBase}?unsubscribe=${r.email_unsubscribe_token}`;
    if (!r.p) continue;
    // Same recipient name as the dialog greeting: the marketing-company contact when saved, else the account holder.
    const { data: dev } = await admin.from('developers').select('marketing_company_id').eq('workspace_owner_id', r.user_id).not('marketing_company_id', 'is', null).limit(1).maybeSingle();
    const { data: mc } = dev?.marketing_company_id ? await admin.from('marketing_companies').select('contact_name,contact_gender').eq('id', dev.marketing_company_id).maybeSingle() : { data: null };
    const { data: dc } = mc?.contact_name ? { data: null } : await admin.from('developers').select('contact_name,contact_gender').eq('workspace_owner_id', r.user_id).not('contact_name', 'is', null).limit(1).maybeSingle();
    const firstName = brokerFirstName(mc?.contact_name?.trim() || dc?.contact_name?.trim() || r.p.full_name);
    const sentSubject = input.subject || (firstName ? `${firstName}, הנכסים שלך כבר מחכים לך ב-TORAFF` : 'הנכסים שלך כבר מחכים לך ב-TORAFF');
    try {
      const { data: roleRows, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', r.user_id);
      if (roleError) throw new Error('קריאת סוג המשתמש נכשלה');
      const recipientType = demoTypeForRoles((roleRows ?? []).map(role => String(role.role)));
      const firstContact = input.first_contact;
      const demo = firstContact ? false : input.demo ?? (recipientType !== null && recipientType !== 'broker');
      const yad2 = firstContact ? (await admin.from('listings').select('address,city').eq('workspace_owner_id', r.user_id).eq('source', 'yad2').not('address', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()).data : null;
      const address = yad2?.address ? [yad2.address, yad2.city].filter(Boolean).join(', ') : null;
      // First contact carries no login or demo link: the button opens a WhatsApp chat to the official number.
      const link = firstContact ? waStart(firstName) : demo ? demoInvitationLink(site.origin, (roleRows ?? []).map(role => String(role.role))) : invitationLink(site.origin, r.user_id, r.invitation_link_token);
      const message = firstContact ? fillFirstContact(input.message ?? firstContactBody('email'), firstName, address) : input.message ?? coldInvitationBody(mc?.contact_gender ?? dc?.contact_gender ?? r.p.gender, (roleRows ?? []).map(role => String(role.role)), 'email').replace('{brokerName}', firstName).replace('{authLink}', link);
      const res = await fetch('https://connector-gateway.lovable.dev/resend/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': RESEND_API_KEY }, body: JSON.stringify({
        from: `TORAFF <${Deno.env.get('RESEND_FROM_EMAIL') || 'join@toraff.co.il'}>`, reply_to: Deno.env.get('RESEND_FROM_EMAIL') || 'join@toraff.co.il', to: [r.p.email], subject: sentSubject,
        html: customEmailHtml(message, link, unsubscribeUrl, demo),
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: [{ name: 'type', value: firstContact ? 'first_contact' : demo ? 'demo_invitation' : 'broker_invitation' }], ...(attachments ? { attachments } : {}),
      }) });
      const raw = await res.text();
      if (!res.ok) throw new Error(`[${res.status}]: ${raw}`);
      const messageId = JSON.parse(raw).id ?? null;
      if(input.outreach&&messageId){const {error:journeyError}=await admin.from('broker_outreach_journeys').update({outreach_message_id:messageId,outreach_channel:'email',stage:'outreach_accepted'}).eq('broker_id',r.user_id);if(journeyError)throw journeyError;}
      await admin.from('admin_broker_onboarding').update({ email_message_id: messageId }).eq('user_id', r.user_id);
      await admin.from('broker_invitation_emails').insert({ broker_id: r.user_id, created_by: caller.userId, to_email: r.p.email, subject: sentSubject, body_text: message ?? `ברירת מחדל${examples.length ? `\n${examples.join('\n')}` : ''}`, links: [{ label: firstContact ? 'פתיחת שיחת וואטסאפ' : demo ? 'צפייה בחשבון הדמו' : 'כניסה לנכסים שלי', url: link }, { label: 'הסרה מרשימת התפוצה', url: unsubscribeUrl }, ...attachLink], message_id: messageId, is_demo: demo });
      if (attachmentId) await markAttachmentSent(admin, attachmentId);
      results.push({ broker_id: r.user_id, status: 'sent' });
    } catch (e) {
      console.error('broker invitation email failed', e);
      await admin.from('admin_broker_onboarding').update({ email_invited_at: null }).eq('user_id', r.user_id);
      results.push({ broker_id: r.user_id, status: 'failed', error: e instanceof Error ? e.message : 'failed' });
    }
  }
  return json({ sent: results.filter(r => r.status === 'sent').length, failed: results.filter(r => r.status === 'failed').length, remaining: Math.max(0, eligible.length - results.filter(r => r.status === 'sent').length), results });
});
