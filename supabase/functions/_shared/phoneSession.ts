/** Called only after the caller's phone challenge has been verified server-side. */
export async function verifiedPhoneSession(admin: any, client: any, phone: string, provider: string) {
  let target: any = null;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    target = users.find((u: any) =>
      String(u.phone ?? '').replace(/\D/g, '') === phone ||
      String(u.user_metadata?.phone_number ?? '').replace(/\D/g, '') === phone);
    if (target || users.length < 1000) break;
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
    const alreadyConfirmed = String(target?.phone ?? '').replace(/\D/g, '') === phone && !!target?.phone_confirmed_at;
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
  return { token_hash: data.properties.hashed_token, verification_type: 'magiclink' };
}
