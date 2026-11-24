import { toIntl } from './phoneSession.ts';

/** Invitation identity is bound only to the saved personal WhatsApp contact, never a scraped login phone. */
export async function requireInvitedBrokerPhone(admin: any, brokerId: string, phone: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brokerId)) throw new Error('קישור ההזמנה אינו תקין');
  const [{ data: contact, error: ce }, { data: onboarding, error: oe }, { data: demo, error: de }, { data: roles, error: re }] = await Promise.all([
    admin.from('broker_whatsapp_contacts').select('whatsapp_phone').eq('broker_id', brokerId).eq('workspace_owner_id', brokerId).maybeSingle(),
    admin.from('admin_broker_onboarding').select('user_id').eq('user_id', brokerId).not('import_source', 'is', null).maybeSingle(),
    admin.from('demo_view_accounts').select('user_id').eq('user_id', brokerId).maybeSingle(),
    admin.from('user_roles').select('role').eq('user_id', brokerId),
  ]);
  if (ce || oe || de || re) throw new Error('לא ניתן לבדוק את פרטי ההזמנה כרגע');
  // Preserve other recipient types' existing phone-auth path; this binding is broker-specific.
  if ((roles ?? []).some((r: {role:string}) => ['developer','marketing_company','property_owner','property_seeker'].includes(r.role))) return false;
  if (!onboarding || demo || !contact?.whatsapp_phone || toIntl(contact.whatsapp_phone) !== toIntl(phone)) throw new Error('יש להזין את מספר הוואטסאפ האישי שנשמר להזמנה');
  const { count, error: ambiguous } = await admin.from('broker_whatsapp_contacts').select('broker_id', { head: true, count: 'exact' }).eq('whatsapp_phone', contact.whatsapp_phone);
  if (ambiguous || count !== 1) throw new Error('המספר אינו משויך באופן חד־משמעי לחשבון. יש לפנות למנהל');
  return true;
}

/** Called after a consumed OTP and a fresh phone binding check. Does not change login/contact phones or roles. */
export async function invitedBrokerSession(admin: any, brokerId: string, phone: string) {
  if (!await requireInvitedBrokerPhone(admin, brokerId, phone)) throw new Error('קישור זה אינו הזמנת מתווך');
  const { data, error } = await admin.auth.admin.getUserById(brokerId);
  if (error || !data?.user?.email) throw new Error('לא ניתן להשלים את הכניסה לחשבון. נסו שוב');
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: data.user.email });
  if (le || !link?.properties?.hashed_token) throw new Error('לא ניתן להשלים את הכניסה לחשבון. נסו שוב');
  return { token_hash: link.properties.hashed_token, verification_type: 'magiclink', existing_account: true };
}