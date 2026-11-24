/** Called only after a real OTP was consumed, never by test-series or role-verification flows. */
export async function recordOutreachOtp(admin: any, brokerId: string, phone: string) {
  // Optional journey bookkeeping must never break an existing valid OTP sign-in.
  try {
    const {error}=await admin.from('broker_outreach_journeys').update({otp_verified_at:new Date().toISOString(),otp_verified_phone:phone}).eq('broker_id',brokerId).eq('enabled',true).is('first_otp_login_at',null);
    if(error)console.error('[broker-outreach-otp-receipt]',error.message);
  }catch{console.error('[broker-outreach-otp-receipt] receipt_unavailable');}
}