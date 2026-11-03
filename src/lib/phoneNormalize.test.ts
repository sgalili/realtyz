import { describe, it, expect } from 'vitest';
import { toIntl } from '../../supabase/functions/_shared/phoneSession';

describe('OTP phone normalization', () => {
  it.each(['0522973500', '+972522973500', '972522973500', '00972522973500', '+972 052-297-3500', '522973500', '052-297-3500'])(
    '%s resolves to 972522973500', v => expect(toIntl(v)).toBe('972522973500'));
});
