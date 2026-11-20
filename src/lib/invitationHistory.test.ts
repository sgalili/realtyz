import { describe, expect, it } from 'vitest';
import { threadInvitationHistory } from './invitationHistory';

const original = { user_id: 'developer-1', channel: 'email' as const, status: 'sent', sent_at: '2026-11-17T00:00:00Z', body: 'original' };

describe('invitation history threading', () => {
  it('shows only the original card while the 48-hour follow-up is pending', () => {
    const pending = { ...original, status: 'pending', sent_at: '2026-11-19T00:00:00Z', body: 'follow-up' };
    const result = threadInvitationHistory([pending, original]);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe('original');
    expect(result[0].followups).toEqual([]);
  });

  it('threads a follow-up only after it was actually sent at least 48 hours later', () => {
    const sentFollowup = { ...original, status: 'accepted', sent_at: '2026-11-19T00:00:00Z', body: 'follow-up' };
    const result = threadInvitationHistory([sentFollowup, original]);
    expect(result).toHaveLength(1);
    expect(result[0].followups.map(item => item.body)).toEqual(['follow-up']);
  });

  it('does not thread a sent repeat before 48 hours as a follow-up', () => {
    const earlyRepeat = { ...original, sent_at: '2026-11-18T23:59:59Z', body: 'early' };
    const result = threadInvitationHistory([earlyRepeat, original]);
    expect(result).toHaveLength(1);
    expect(result[0].followups).toEqual([]);
  });

  it('keeps separate original cards for different recipients and channels', () => {
    const whatsapp = { ...original, channel: 'whatsapp' as const };
    const other = { ...original, user_id: 'developer-2' };
    expect(threadInvitationHistory([original, whatsapp, other])).toHaveLength(3);
  });
});
