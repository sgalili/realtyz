import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommissionTierBadges, { RewardIcons } from './CommissionTierBadges';

const access = vi.hoisted(() => ({ allowed: false, guest: false, roles: [] as string[], admin: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: access.guest ? null : { id: 'viewer' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ roles: access.roles, isSuperAdmin: access.admin }) }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: access.allowed }) }));
const tiers = { tier1: 10, tier2: 20, tier3: 0, tier4: 900, tier4Type: 'fixed' as const };
afterEach(() => { cleanup(); access.allowed = false; access.guest = false; access.roles = []; access.admin = false; });
describe('commission visibility', () => {
  it.each(['guest', 'super_admin', 'agent'])('shows four ordered types including zero leads for %s', (role) => {
    access.guest = role === 'guest';
    access.admin = role === 'super_admin';
    access.roles = [role];
    const { container } = render(<CommissionTierBadges tiers={tiers} />);
    expect([...container.querySelectorAll('[data-commission-icons] span[title]')].map(row => row.getAttribute('title'))).toEqual(['שדות מטופס בעמוד נחיתה', 'סינון בווטסאפ', 'שיחת טלפון', 'סגירת עסקה']);
    expect(screen.queryByText('ללא עמלה')).toBeNull();
    expect(container.querySelector('span[title="שיחת טלפון"].lead-no-fee')).toBeTruthy();
    expect(screen.queryByText(/900/)).toBeNull();
  });
  it('never labels a redacted closing value as zero', () => {
    access.admin = true;
    render(<CommissionTierBadges tiers={{ ...tiers, tier3: 20, tier4: 0 }} />);
    expect(screen.getByLabelText('סגירת עסקה')).toBeTruthy();
    expect(screen.queryByText('ללא עמלה')).toBeNull();
  });
  it('keeps three or four reward rows in both layouts', () => {
    access.allowed = true;
    const { container, rerender } = render(<CommissionTierBadges tiers={{ ...tiers, tier3: 30 }} />);
    expect(container.querySelectorAll('[data-commission-icons] span[title]')).toHaveLength(4);
    rerender(<CommissionTierBadges tiers={{ ...tiers, tier3: 30 }} />);
    expect(container.querySelectorAll('[data-commission-icons] span[title]')).toHaveLength(4);
  });
  it('keeps closing locked for unlicensed users', () => {
    render(<CommissionTierBadges tiers={tiers} />);
    expect(screen.getByRole('button', { name: 'סגירת עסקה · למתווכים בלבד' })).toBeTruthy();
    expect(screen.queryByText(/720/)).toBeNull();
    expect(screen.queryByTitle(/שיחת טלפון/)).toBeNull();
    expect(screen.getByTitle(/שדות מטופס בעמוד נחיתה/)).toBeTruthy();
    expect(screen.getByTitle(/סינון בווטסאפ/)).toBeTruthy();
  });
  it.each(['guest', 'super_admin', 'developer', 'property_owner', 'property_seeker', 'affiliate', 'agent'])('redacts closing prices even if supplied to the indicator for %s', role => {
    access.guest = role === 'guest'; access.roles = [role]; access.admin = role === 'super_admin';
    render(<RewardIcons types={{ closing: true }} prices={{ closing: 10000 }} zeroTypes={{ closing: true }} />);
    expect(screen.queryByText('₪10,000')).toBeNull();
    expect(screen.queryByText('ללא עמלה')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'סגירת עסקה · למתווכים בלבד' }));
    expect(screen.getByRole('link', { name: /קורס הכנה/ }).getAttribute('href')).toContain('easytest.co.il');
    expect(screen.getByRole('link', { name: /הרשמה למבחן/ }).getAttribute('href')).toBe('https://www.gov.il/he/service/registration_for_examination_in_real_estate_law');
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
    access.allowed = true;
    render(<RewardIcons types={{ closing: true }} prices={{ closing: 720.6 }} closingLevel={1} label={null} />);
    expect(screen.getByText('₪721')).toBeTruthy();
    expect(screen.queryByText(/720\.6/)).toBeNull();
  });
});