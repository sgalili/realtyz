import { describe, expect, it } from 'vitest';
import { commissionEditScope } from './PropertyCommissionIcons';

const row = (user_id: string, workspace_owner_id: string) => ({ user_id, workspace_owner_id });

describe('commissionEditScope', () => {
  it('lets the advertiser edit directly', () => {
    expect(commissionEditScope(row('u1', 'u1'), 'u1', 'u1', false)).toBe('edit');
  });

  it('lets a member of the ad workspace edit directly', () => {
    expect(commissionEditScope(row('u1', 'w1'), 'u2', 'w1', false)).toBe('edit');
  });

  it('gives a Super Admin who does not own the ad read-only admin-only scope', () => {
    expect(commissionEditScope(row('u1', 'w1'), 'admin', 'admin-ws', true)).toBe('admin-only');
  });

  it('gives a Super Admin admin-only scope even inside the ad workspace', () => {
    expect(commissionEditScope(row('u1', 'w1'), 'admin', 'w1', true)).toBe('admin-only');
  });

  it('denies everyone else', () => {
    expect(commissionEditScope(row('u1', 'w1'), 'u2', 'w2', false)).toBe('none');
  });
});
