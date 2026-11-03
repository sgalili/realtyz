/** Called only after the caller's phone challenge has been verified server-side. */
/** Canonical Israeli form 9725XXXXXXXX for 05X / 5X / +972 / 972 / 00972 / 9720 inputs. */
export const toIntl = (v: unknown) => {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9720')) d = `972${d.slice(4)}`;
  if (/^0\d{8,9}$/.test(d)) d = `972${d.slice(1)}`;
  else if (/^5\d{8}$/.test(d)) d = `972${d}`;
  return d;
};
export async function verifiedPhoneSession(admin: any, client: any, rawPhone: string, provider: string) {
  const phone = toIntl(rawPhone);
  let target: any = null;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    target = users.find((u: any) =>
      toIntl(u.phone) === phone || toIntl(u.user_metadata?.phone_number) === phone);
    if (target || users.length < 1000) break;
  }
  // Fallback: an existing profile saved the number in another format
  // (05XXXXXXXX / +9725XXXXXXXX / 9725XXXXXXXX). Match it after normalizing.
  if (!target) {
    const local = `0${phone.slice(3)}`;
    const { data: rows } = await admin.from('profiles').select('id, phone')
      .or(`phone.eq.${local},phone.eq.${phone},phone.eq.+${phone},phone.ilike.%${phone.slice(-9)}`).limit(10);
    const match = (rows ?? []).filter((r: any) => toIntl(r.phone) === phone);
    let pick = match.length === 1 ? match[0] : null;
    if (match.length > 1) {
      // Several profiles share the number: prefer the one holding a real role.
      const { data: rr } = await admin.from('user_roles').select('user_id, role').in('user_id', match.map((m: any) => m.id));
      const ranked = match.filter((m: any) => (rr ?? []).some((r: any) => r.user_id === m.id && r.role !== 'user'));
      if (ranked.length === 1) pick = ranked[0];
    }
    if (pick) {
      const { data } = await admin.auth.admin.getUserById(pick.id);
      if (data?.user) target = data.user;
    }
  }
  let existingAccount = false;
  if (target) {
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', target.id);
    existingAccount = (roleRows ?? []).some((r: any) => r.role !== 'user');
  }
  // Phone-provider logins are disabled at the auth layer, so phone-only
  // accounts get a non-deliverable internal sign-in alias (never emailed,
  // RFC 2606 .invalid TLD) and sign in through a server-issued magic-link hash.
  let email: string | undefined = target?.email;
  let userId: string | undefined = target?.id;
  if (!email) {
    email = `p${phone}@phone.toraff.invalid`;
    if (target) {
      const { error } = await admin.auth.admin.updateUserById(target.id, { email, email_confirm: true, phone: `+${phone}`, phone_confirm: true });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, email_confirm: true, phone: `+${phone}`, phone_confirm: true,
        user_metadata: { provider, phone_number: phone, internal_email_alias: true },
      });
      if (error) throw error;
      userId = data.user?.id;
    }
  }
  void client;
  // Every account update happens BEFORE the sign-in link is issued: updating
  // the user afterwards can invalidate the freshly issued token hash, which
  // made a correct SMS code fail at the final sign-in step.
  if (provider === 'sms_019') {
    if (!userId) throw new Error('Verified account missing');
    const alreadyConfirmed = toIntl(target?.phone) === phone && !!target?.phone_confirmed_at;
    if (!alreadyConfirmed) {
      const { error: phoneError } = await admin.auth.admin.updateUserById(userId, { phone: `+${phone}`, phone_confirm: true });
      if (phoneError) throw phoneError;
    }
    const { error: evidenceError } = await admin.from('broker_sms_verifications').upsert({ user_id: userId, phone_number: phone, verified_at: new Date().toISOString() });
    if (evidenceError) throw evidenceError;
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  if (!data.properties?.hashed_token) throw new Error('Phone session could not be created');
  return { token_hash: data.properties.hashed_token, verification_type: 'magiclink', existing_account: existingAccount };
}
