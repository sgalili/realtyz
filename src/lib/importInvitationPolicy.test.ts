import { describe, expect, it } from 'vitest';
import { FOLLOWUP_DELAY_MS, followupDue, pendingFirstInvitation } from '../../supabase/functions/_shared/importInvitationPolicy';

describe('import invitation queue', () => {
  const row = { import_source: 'developer_import', first_login_at: null, first_invitation_at: null };
  it('keeps imported accounts waiting before the first invitation', () => {
    expect(pendingFirstInvitation(row, null)).toBe(true);
    expect(pendingFirstInvitation({ ...row, import_source: null }, null)).toBe(false);
    expect(pendingFirstInvitation({ ...row, first_invitation_at: '2026-11-17T00:00:00Z' }, null)).toBe(false);
  });
  it('does not include accounts that have already logged in', () => {
    expect(pendingFirstInvitation(row, '2026-11-17T00:00:00Z')).toBe(false);
  });
  it('queues at exactly 48 hours, never earlier', () => {
    const sent = '2026-11-17T00:00:00Z';
    expect(FOLLOWUP_DELAY_MS).toBe(172800000);
    expect(followupDue(sent, Date.parse(sent) + 172799999, null, null)).toBe(false);
    expect(followupDue(sent, Date.parse(sent) + 172800000, null, null)).toBe(true);
  });
  it('suppresses follow-ups after clicking the invitation', () => {
    expect(followupDue('2026-11-17T00:00:00Z', Date.parse('2026-11-20T00:00:00Z'), '2026-11-18T00:00:00Z', null)).toBe(false);
  });
  it('suppresses follow-ups after first login', () => {
    expect(followupDue('2026-11-17T00:00:00Z', Date.parse('2026-11-20T00:00:00Z'), null, '2026-11-18T00:00:00Z')).toBe(false);
  });
});