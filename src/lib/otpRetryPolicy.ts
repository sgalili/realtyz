/** A consumed/expired/exhausted challenge must be replaced, not replayed. */
export function otpNeedsNewCode(code: unknown, continuationFailed = false): boolean {
  return continuationFailed || ['otp_expired', 'otp_attempts', 'otp_consumed'].includes(String(code));
}