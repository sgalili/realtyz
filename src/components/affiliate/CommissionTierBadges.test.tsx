import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommissionTierBadges, { RewardIcons } from './CommissionTierBadges';

const access = vi.hoisted(() => ({ allowed: false }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: access.allowed }) }));
const tiers = { tier1: 10, tier2: 20, tier3: 0, tier4: 900, tier4Type: 'fixed' as const };
afterEach(() => { cleanup(); access.allowed = false; });
describe('commission visibility', () => {
  it('keeps three or four reward rows in both layouts', () => {
    access.allowed = true;
    const { container, rerender } = render(<CommissionTierBadges tiers={{ ...tiers, tier3: 30 }} />);
    expect(container.querySelectorAll('[data-commission-icons] span[title]')).toHaveLength(4);
    rerender(<CommissionTierBadges tiers={{ ...tiers, tier3: 30 }} />);
    expect(container.querySelectorAll('[data-commission-icons] span[title]')).toHaveLength(4);
  });
  it('hides closing amount, icon and label for unlicensed users', () => {
    render(<CommissionTierBadges tiers={tiers} />);
    expect(screen.queryByTitle(/סגירת עסקה/)).toBeNull();
    expect(screen.queryByText(/720/)).toBeNull();
    expect(screen.queryByTitle(/שיחת טלפון/)).toBeNull();
    expect(screen.getByTitle(/שדות מטופס בעמוד נחיתה/)).toBeTruthy();
    expect(screen.getByTitle(/סינון בווטסאפ/)).toBeTruthy();
  });
  it('shows closing only with verified server access', () => {
    access.allowed = true;
    render(<CommissionTierBadges tiers={tiers} compact />);
    expect(screen.getByLabelText(/סגירת עסקה/)).toBeTruthy();
  });
  it('honors an explicit closing lock even for a licensed user', () => {
    access.allowed = true;
    render(<CommissionTierBadges tiers={tiers} compact level4Locked />);
    expect(screen.queryByLabelText(/סגירת עסקה/)).toBeNull();
  });
  it('closing prices always render as whole amounts without decimals', () => {
    render(<RewardIcons types={{ closing: true }} prices={{ closing: 720.6 }} closingLevel={1} label={null} />);
    expect(screen.getByText('₪721')).toBeTruthy();
    expect(screen.queryByText(/720\.6/)).toBeNull();
  });
});