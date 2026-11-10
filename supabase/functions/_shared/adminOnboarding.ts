export async function recipientIsSilent(admin: any, phone: string): Promise<boolean> {
  const { data, error } = await admin.rpc('admin_onboarding_recipient_silent', { _phone: phone });
  if (error) throw new Error('onboarding_delivery_guard_unavailable');
  return data === true;
}