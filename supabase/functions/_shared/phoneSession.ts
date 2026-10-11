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
  // Existing email-first and legacy identities retain their account ID.
  if (target?.email) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: target.email });
    if (error) throw error;
    return { token_hash: data.properties?.hashed_token };
  }
  // A fresh server-only password obtains a session without inventing an email
  // or invoking a second SMS provider. It is never returned or persisted by the app.
  const password = crypto.randomUUID() + crypto.randomUUID();
  if (target) {
    const { error } = await admin.auth.admin.updateUserById(target.id, { password, phone: `+${phone}`, phone_confirm: true });
    if (error) throw error;
  } else {
    const { error } = await admin.auth.admin.createUser({
      phone: `+${phone}`, password, phone_confirm: true,
      user_metadata: { provider, phone_number: phone },
    });
    if (error) throw error;
  }
  const { data, error } = await client.auth.signInWithPassword({ phone: `+${phone}`, password });
  if (error) throw error;
  if (!data.session) throw new Error('Phone session could not be created');
  return { session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } };
}