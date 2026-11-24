import { expect, it } from 'vitest';
import { otpNeedsNewCode } from './otpRetryPolicy';
it.each(['otp_expired','otp_attempts','otp_consumed'])('requires a fresh challenge after %s', code => expect(otpNeedsNewCode(code)).toBe(true));
it('requires a new challenge when final session creation failed after consuming OTP', () => expect(otpNeedsNewCode(undefined,true)).toBe(true));
it('permits correction of a mismatched code without replacing a valid challenge', () => expect(otpNeedsNewCode('otp_mismatch')).toBe(false));