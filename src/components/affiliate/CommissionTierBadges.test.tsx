import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommissionTierBadges from './CommissionTierBadges';

const access = vi.hoisted(() => ({ allowed: false }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: access.allowed }) }));
const tiers = { tier1: 10, tier2: 20, tier3: 0, tier4: 900, tier4Type: 'fixed' as const };
afterEach(() => { cleanup(); access.allowed = false; });
describe('commission visibility', () => {
  it('keeps three or four prices in two columns in both layouts', () => {
    access.allowed = true;
    const { container, rerender } = render(<CommissionTierBadges tiers={{ ...tiers, tier3: 30 }} compact />);
    expect(container.firstElementChild?.className).toContain('grid-cols-2');
    expect(container.firstElementChild?.children.length).toBe(4);
    rerender(<CommissionTierBadges tiers={{ ...tiers, tier3: 30 }} />);
    expect(container.firstElementChild?.className).not.toContain('sm:grid-cols-4');
    expect(container.firstElementChild?.className).toContain('grid-cols-2');
  });
  it('hides closing amount, icon and label for unlicensed users', () => {
    render(<CommissionTierBadges tiers={tiers} compact />);
    expect(screen.queryByLabelText(/סגירת עסקה/)).toBeNull();
    expect(screen.queryByText(/720/)).toBeNull();
    expect(screen.queryByLabelText(/שיחת טלפון/)).toBeNull();
    expect(screen.getByLabelText(/שדות מטופס בעמוד נחיתה/)).toBeTruthy();
    expect(screen.getByLabelText(/סינון בווטסאפ/)).toBeTruthy();
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
});