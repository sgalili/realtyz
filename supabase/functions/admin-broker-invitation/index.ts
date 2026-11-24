import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.25.76';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { coldInvitationBody, firstContactBody, FIRST_CONTACT_WHATSAPP, firstContactWhatsApp, invitationTextFor, invitationTargetPhone, officialBrokerPhone, BROKER_TEMPLATE_LANGUAGE, templateBody, templateHasLink, invitationTemplateName } from '../_shared/brokerInvitationTemplate.ts';
import { loadAttachment, attachmentSignedUrl, markAttachmentSent } from '../_shared/invitationAttachment.ts';
import { publicSiteOrigin, invitationLink, demoInvitationLink } from '../_shared/importInvitationPolicy.ts';

const schema = z.object({
  action: z.enum(['status', 'register', 'send', 'texts', 'save_text', 'save_email_text', 'whatsapp_eligibility']),
  text: z.string().max(4000).optional(),
  broker_id: z.string().uuid().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  request_id: z.string().uuid().optional(),
  consent: z.literal(true).optional(),
  demo: z.boolean().optional(),
  attachment_id: z.string().uuid().nullable().optional(),
  use_discovered_whatsapp: z.boolean().default(false),
  outreach: z.boolean().default(false),
}).strict();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId)) return json({ error: 'Super Admin required' }, 403);
  let parsed;
  try { parsed = schema.safeParse(await req.json()); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const admin = adminClient();
  const demo = input.demo ?? true;
  // Wording is fixed server-side; on send the recipient's saved gender decides the variant.
  let gender: unknown = input.gender;
  // A developer's marketing-company contact, when saved, receives the invitation and sign-in code.
  let contact: { name: string | null; phone: string | null; gender: string | null } | null = null;
  if (input.broker_id) {
    const { data: g } = await admin.from('profiles').select('gender').eq('id', input.broker_id).maybeSingle();
    gender = g?.gender;
    const { data: dev } = await admin.from('developers').select('marketing_company_id').eq('workspace_owner_id', input.broker_id).not('marketing_company_id', 'is', null).order('created_at').limit(1).maybeSingle();
    const { data: proj } = dev ? { data: null } : await admin.from('developer_projects').select('marketing_company_id').eq('workspace_owner_id', input.broker_id).not('marketing_company_id', 'is', null).order('created_at').limit(1).maybeSingle();
    const companyId = dev?.marketing_company_id ?? proj?.marketing_company_id;
    if (companyId) {
      const { data: mc } = await admin.from('marketing_companies').select('contact_name,contact_phone,contact_gender').eq('id', companyId).maybeSingle();
      if (mc?.contact_phone) { contact = { name: mc.contact_name, phone: mc.contact_phone, gender: mc.contact_gender }; if (mc.contact_gender) gender = mc.contact_gender; }
    }
    if (!contact) {
      // Contact saved directly on the developer (no marketing company).
      const { data: dc } = await admin.from('developers').select('contact_name,contact_phone,contact_gender').eq('workspace_owner_id', input.broker_id).not('contact_phone', 'is', null).order('created_at').limit(1).maybeSingle();
      if (dc?.contact_phone) { contact = { name: dc.contact_name, phone: dc.contact_phone, gender: dc.contact_gender }; if (dc.contact_gender) gender = dc.contact_gender; }
    }
  }
  let roles: string[] = [];
  let demoLink: string | null = null;
  if (input.broker_id) {
    const { data: roleRows, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', input.broker_id);
    if (roleError) return json({ error: 'קריאת סוג המשתמש נכשלה' }, 500);
    roles = (roleRows ?? []).map(role => String(role.role));
    demoLink = demoInvitationLink(publicSiteOrigin(), roles);
  }
  if (input.action === 'whatsapp_eligibility') {
    if (!input.broker_id) return json({ error: 'נדרש מתווך לבדיקת מספר WhatsApp' }, 400);
    const { data: importedBroker, error: importedError } = await admin.from('admin_broker_onboarding').select('imported_license_number').eq('user_id', input.broker_id).not('import_source', 'is', null).maybeSingle();
    if (importedError) return json({ error: 'בדיקת המתווך נכשלה' }, 500);
    const isBroker = roles.some(role => ['agent', 'lead_agent', 'managing_broker', 'junior_agent'].includes(role)) || !!importedBroker?.imported_license_number;
    if (!isBroker) return json({ eligible: false });
    const { data: whatsapp, error: whatsappError } = await admin.from('broker_whatsapp_contacts').select('whatsapp_phone').eq('broker_id', input.broker_id).eq('workspace_owner_id', input.broker_id).maybeSingle();
    if (whatsappError) return json({ error: 'בדיקת מספר WhatsApp השמור נכשלה' }, 500);
    return json({ eligible: officialBrokerPhone(whatsapp?.whatsapp_phone ?? '') !== null });
  }
  const { data: saved } = await admin.from('broker_invitation_template_texts').select('gender,body');
  const savedFor = (g: unknown) => invitationTextFor(saved?.find(r => r.gender === (g === 'female' ? 'female' : 'male'))?.body, g, roles);
  if (input.action === 'texts') return json({ male: savedFor('male'), female: savedFor('female'), ...(input.broker_id ? { recipient: savedFor(gender), email_recipient: saved?.find(r => r.gender === 'email_first_contact')?.body ?? firstContactBody('email'), recipient_gender: gender === 'female' ? 'female' : 'male', demo_link: demoLink } : {}) });
  if (input.action === 'save_email_text') {
    // Global first-outreach email default only; the WhatsApp template is fixed and never touched here.
    const t = (input.text ?? '').trim();
    if (t.length < 20 || t.length > 4000) return json({ error: 'נוסח המייל חייב להכיל 20 עד 4000 תווים' }, 400);
    const { error } = await admin.from('broker_invitation_template_texts').upsert({ gender: 'email_first_contact', body: t, updated_by: caller.userId, updated_at: new Date().toISOString() });
    if (error) return json({ error: 'שמירת הנוסח הכללי נכשלה' }, 500);
    return json({ ok: true });
  }
  if (input.action === 'save_text') {
    if (input.gender !== 'male' && input.gender !== 'female') return json({ error: 'יש לבחור נוסח לגברים או לנשים' }, 400);
    try {
      const candidate = templateBody(input.text ?? '');
      if (demo && !templateHasLink(candidate)) return json({ error: 'תבנית דמו חייבת לכלול את {authLink} כדי לשלוח קישור צפייה' }, 400);
    } catch (e) { return json({ error: e instanceof Error ? e.message : 'נוסח לא תקין' }, 400); }
    const { error } = await admin.from('broker_invitation_template_texts').upsert({ gender: input.gender, body: (input.text ?? '').trim(), updated_by: caller.userId, updated_at: new Date().toISOString() });
    if (error) return json({ error: 'שמירת הנוסח נכשלה' }, 500);
    gender = input.gender;
  }
  let text = savedFor(gender);
  let outreachAddress: string | null = null;
  if(input.outreach){
    if(!input.broker_id)return json({error:'נדרש מתווך למסלול הפנייה'},400);
    const {data:j,error:je}=await admin.from('broker_outreach_journeys').select('enabled,message_consent_at,opted_out_at').eq('broker_id',input.broker_id).maybeSingle();
    const {data:listing,error:le}=await admin.from('listings').select('address,city').eq('workspace_owner_id',input.broker_id).eq('source','yad2').not('address','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(je||le)return json({error:'טעינת מסלול הפנייה נכשלה'},500);
    if(!j?.enabled||!j.message_consent_at||j.opted_out_at)return json({error:'נדרשת הסכמה מתועדת להפעלת מסלול הפנייה'},409);
    if(!listing?.address||!listing.city)return json({error:'אין כתובת ועיר מאומתות ממודעת יד2 לפנייה האישית'},409);
    outreachAddress=[listing.address,listing.city].join(', ');
    text=firstContactWhatsApp(gender);
  }
  // Every first WhatsApp invitation uses the fixed short opt-in template; saved/legacy long texts never reach the recipient.
  if(!input.outreach && input.action!=='save_text'){
    const {data:listing}=input.broker_id?await admin.from('listings').select('address,city').eq('workspace_owner_id',input.broker_id).eq('source','yad2').not('address','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle():{data:null};
    outreachAddress=listing?.address?[listing.address,listing.city].filter(Boolean).join(', '):'יד2';
    text=firstContactWhatsApp(gender);
  }
  const firstContact = text===FIRST_CONTACT_WHATSAPP || text===firstContactWhatsApp('female');
  let body: string;
  try { body = firstContact ? text : templateBody(text); } catch (e) { return json({ error: e instanceof Error ? e.message : 'Invalid template' }, 400); }
  const name = await invitationTemplateName(body);
  if (input.action === 'send' && demo && !firstContact && !templateHasLink(body)) return json({ error: 'תבנית הדמו אינה כוללת קישור. יש לעדכן אותה ולהגיש ל-Meta מחדש.' }, 409);
  try {
    // Use only the platform's already configured official number, never the target broker's WABA.
    const { data: rows, error: configError } = await admin.from('wa_providers').select('config').eq('provider_name', 'WBA').eq('is_official', true).eq('is_active', true).order('updated_at', { ascending: false });
    if (configError) throw new Error('קריאת חיבור WhatsApp נכשלה');
    const cfg = rows?.map(r => r.config as Record<string, unknown>).find(c => String(c.display_phone_number ?? c.phone_number ?? '').replace(/\D/g, '') === '972537983832' && c.waba_id && c.phone_number_id && (c.access_token || Deno.env.get('META_WA_ACCESS_TOKEN')));
    if (!cfg) return json({ error: 'פרטי חשבון WhatsApp הרשמי אינם זמינים' }, 503);
    const token = String(cfg.access_token || Deno.env.get('META_WA_ACCESS_TOKEN') || '');
    const version = String(cfg.api_version || 'v25.0');
    if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(String(cfg.waba_id)) || !/^\d+$/.test(String(cfg.phone_number_id))) return json({ error: 'הגדרת WhatsApp הרשמי אינה תקינה' }, 503);
    const call = async (path: string, payload?: unknown) => {
      const res = await fetch(`https://graph.facebook.com/${version}/${path}`, { method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      const raw = await res.text();
      if (!res.ok) { console.error(`Meta broker invitation [${res.status}]: ${raw}`); throw new Error(`[${res.status}]: ${raw}`); }
      const data = JSON.parse(raw);
      if (data.error) throw new Error(`[${res.status}]: ${raw}`);
      return data;
    };
    const live = await call(`${cfg.waba_id}/message_templates?name=${name}&fields=name,status,language,components&limit=100`);
    let template = live.data?.find((t: { name: string; language: string }) => t.name === name && t.language === BROKER_TEMPLATE_LANGUAGE);
    if (template && template.components?.find((c: { type: string }) => c.type === 'BODY')?.text !== body) return json({ error: 'נוסח Meta אינו תואם לתצוגה. יש לרענן לפני שליחה.' }, 409);
    if ((input.action === 'register' || input.action === 'save_text') && !template) {
      template = await call(`${cfg.waba_id}/message_templates`, { name, language: BROKER_TEMPLATE_LANGUAGE, category: 'MARKETING', components: [{ type: 'BODY', text: body, example: { body_text: [firstContact ? ['ישראל','הרצל 10, תל אביב'] : templateHasLink(body) ? ['ישראל ישראלי', 'https://toraff.co.il/auth'] : ['ישראל ישראלי']] } }] });
    }
    if (input.action !== 'send') return json({ name, status: template?.status ?? 'NOT_REGISTERED', text:firstContact?text.replace('{{2}}',outreachAddress??''):text, sender: '972537983832', demo_link: demoLink });
    if (!input.broker_id || !input.request_id || !input.consent) return json({ error: 'נדרשים מתווך, מזהה שליחה ואישור הסכמת הנמען' }, 400);
    if (template?.status !== 'APPROVED') return json({ error: 'התבנית טרם אושרה ב-Meta', status: template?.status ?? 'NOT_REGISTERED' }, 409);
    const { data: broker, error: brokerError } = await admin.from('profiles').select('id,full_name,phone').eq('id', input.broker_id).single();
    const invitedRoles = ['agent', 'lead_agent', 'managing_broker', 'junior_agent', 'developer', 'marketing_company', 'property_owner', 'property_seeker', 'affiliate'];
    const { data: importedBroker } = await admin.from('admin_broker_onboarding').select('imported_license_number').eq('user_id', input.broker_id).not('import_source', 'is', null).maybeSingle();
    if (brokerError || !broker || (!roles.some(role => invitedRoles.includes(role)) && !importedBroker?.imported_license_number)) return json({ error: 'הנמען אינו חשבון הממתין להזמנה' }, 400);
    const isBrokerRecipient = roles.some(role => ['agent','lead_agent','managing_broker','junior_agent'].includes(role)) || !!importedBroker?.imported_license_number;
    const useSavedWhatsApp = isBrokerRecipient || input.use_discovered_whatsapp;
    const { data: discovered, error: discoveryError } = useSavedWhatsApp ? await admin.from('broker_whatsapp_contacts').select('whatsapp_phone').eq('broker_id', broker.id).eq('workspace_owner_id', broker.id).maybeSingle() : { data: null, error: null };
    if (discoveryError) return json({ error: 'בדיקת מספר WhatsApp השמור נכשלה' }, 500);
    const phone = isBrokerRecipient
      ? officialBrokerPhone(discovered?.whatsapp_phone ?? '')
      : invitationTargetPhone(discovered?.whatsapp_phone ?? null, contact?.phone ?? null, broker.phone, useSavedWhatsApp);
    if (isBrokerRecipient && !phone) return json({ error: 'אין מספר וואטסאפ אישי שמור למתווך. לא נעשה שימוש בטלפון איש הקשר או בטלפון הכניסה.' }, 409);
    if (!phone) return json({ error: 'חסר מספר נייד תקין למתווך' }, 400);
    const { data: onboarding, error: onboardingError } = await admin.from('admin_broker_onboarding').select('user_id,invitation_link_token,first_invitation_at,first_login_at').eq('user_id', broker.id).maybeSingle();
    if (onboardingError || !onboarding) return json({ error: 'המתווך אינו בתהליך הצטרפות בניהול מנהל' }, 409);
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(broker.id);
    if (accountError || !account.user || account.user.last_sign_in_at) return json({ error: 'החשבון אינו ממתין להזמנה ראשונה' }, 409);
    if (onboarding.first_login_at || onboarding.first_invitation_at) return json({ error: 'הזמנה ראשונה כבר נשלחה או שהחשבון כבר התחבר' }, 409);
    const { error: claimError } = await admin.from('broker_invitation_sends').insert({ request_id: input.request_id, broker_id: broker.id, created_by: caller.userId, template_name: name });
    if (claimError) {
      const { data: prior } = await admin.from('broker_invitation_sends').select('status,message_id,broker_id,template_name,created_by').eq('request_id', input.request_id).maybeSingle();
      if (prior?.created_by === caller.userId && prior.broker_id === broker.id && prior.template_name === name && prior.status === 'accepted') return json({ success: true, message_id: prior.message_id, duplicate: true });
      return json({ error: 'שליחה זו כבר החלה. יש לבדוק את הסטטוס לפני ניסיון נוסף.' }, 409);
    }
    let sent;
    try {
      const site = new URL(publicSiteOrigin());
      if (site.protocol !== 'https:' || /lovable\./.test(site.hostname)) throw new Error('Invalid public site');
      const link = demo ? demoLink : invitationLink(site.origin, broker.id, onboarding.invitation_link_token);
      if (!link) throw new Error('Missing invitation link');
      sent = await call(`${cfg.phone_number_id}/messages`, { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name, language: { code: BROKER_TEMPLATE_LANGUAGE }, components: [{ type: 'body', parameters: [{ type: 'text', text: (contact?.name || broker.full_name)?.trim().split(/\s+/)[0] || 'מתווך' }, ...(firstContact ? [{type:'text',text:outreachAddress??''}] : templateHasLink(body) ? [{ type: 'text', text: link }] : [])] }] } });
    } catch (e) {
      await admin.from('broker_invitation_sends').update({ status: 'unknown' }).eq('request_id', input.request_id);
      throw e;
    }
    const messageId = sent.messages?.[0]?.id;
    if (!messageId) return json({ error: 'Meta לא החזירה מזהה הודעה; יש לבדוק לפני שליחה חוזרת' }, 502);
    const { error: sendError } = await admin.from('broker_invitation_sends').update({ status: 'accepted', message_id: messageId }).eq('request_id', input.request_id);
    const { error: trackError } = await admin.from('admin_broker_onboarding').update({ invited_at: new Date().toISOString(), invitation_message_id: messageId }).eq('user_id', broker.id);
    if (sendError || trackError) return json({ error: 'Meta קיבלה את ההודעה אך עדכון שלב ההצטרפות נכשל. אין לשלוח שוב.', message_id: messageId }, 500);
    if(input.outreach){
      const {error:journeyError}=await admin.from('broker_outreach_journeys').update({outreach_message_id:messageId,outreach_channel:'whatsapp',stage:'outreach_accepted'}).eq('broker_id',broker.id);
      if(journeyError)return json({error:'ההודעה התקבלה אך רישום מסלול הפנייה נכשל. אין לשלוח שוב.',message_id:messageId},500);
    }
    // Attachment follows the approved template as a document message; Meta may reject it outside an open 24h conversation.
    let attachment_status: string | undefined;
    if (input.attachment_id) {
      try {
        const a = await loadAttachment(admin, input.attachment_id);
        if (a) { await call(`${cfg.phone_number_id}/messages`, { messaging_product: 'whatsapp', to: phone, type: 'document', document: { link: await attachmentSignedUrl(admin, a), filename: a.file_name } }); await markAttachmentSent(admin, a.id); attachment_status = 'sent'; }
      } catch (e) { console.error('invitation attachment failed', e); attachment_status = 'failed'; }
    }
    return json({ success: true, message_id: messageId, status: 'accepted', attachment_status });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'שליחת ההזמנה נכשלה' }, 502); }
});