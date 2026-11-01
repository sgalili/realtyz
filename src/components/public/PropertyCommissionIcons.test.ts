import { describe, expect, it } from 'vitest';
import { commissionEditScope, rewardColorLevels } from './PropertyCommissionIcons';

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

// A guest's listing payload carries no amounts and a zeroed closing level, so
// the board's server-computed facts must drive icon colors in every view.
describe('rewardColorLevels', () => {
  const redactedGuestSource = {
    affiliate_tier1_amount: null, affiliate_tier2_amount: null, affiliate_tier3_amount: null,
    affiliate_tier4_amount: null, affiliate_tier4_type: null, reward_levels: null, closing_level: 0,
    deal_type: 'sale', asking_price: 4950000,
  };
  const zeroTiers = { tier1: 0, tier2: 0, tier3: 0 };

  it('paints with the board facts instead of the redacted guest payload', () => {
    const facts = { reward_levels: { form: 3, whatsapp: 1, phone: 2 }, closing_level: 2 };
    const out = rewardColorLevels(facts, redactedGuestSource, {}, zeroTiers, { value: null, type: null, dealType: 'sale', price: 4950000 });
    expect(out.levels).toEqual({ form: 3, whatsapp: 1, phone: 2 });
    expect(out.closingLevel).toBe(2);
  });

  it('falls back to the server derivation from amounts a viewer may see', () => {
    const out = rewardColorLevels(undefined, { deal_type: 'sale', asking_price: 1000000 }, {}, { tier1: 150, tier2: 50, tier3: 80 }, { value: 1, type: 'percent', dealType: 'sale', price: 1000000 });
    expect(out.levels).toEqual({ form: 3, whatsapp: 0, phone: 0 });
    expect(out.closingLevel).toBe(1);
  });

  it('keeps unpriced reward types uncolored', () => {
    const out = rewardColorLevels(undefined, { deal_type: 'rent', asking_price: 5000 }, {}, zeroTiers, { value: 0, type: 'fixed', dealType: 'rent', price: 5000 });
    expect(out.levels).toEqual({ form: null, whatsapp: null, phone: null });
    expect(out.closingLevel).toBe(0);
  });
});
