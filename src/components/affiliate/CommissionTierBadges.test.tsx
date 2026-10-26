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
    if (role === 'guest') {
      // Signed-out visitors keep the grayed icons without any text labels.
      expect(screen.getByText('ללא עמלה')).toBeTruthy();
      expect(screen.queryByText('למתווכים בלבד')).toBeNull();
    } else {
      // Signed-in users see the labels next to the grayed icons.
      expect(screen.getByText('ללא עמלה')).toBeTruthy();
      expect(screen.getByText('למתווכים')).toBeTruthy();
    }
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
    expect(screen.getByLabelText('סגירת עסקה')).toBeTruthy();
    expect(screen.queryByText(/720/)).toBeNull();
    expect(screen.getByTitle(/שיחת טלפון/)).toBeTruthy();
    expect(screen.getByTitle(/שדות מטופס בעמוד נחיתה/)).toBeTruthy();
    expect(screen.getByTitle(/סינון בווטסאפ/)).toBeTruthy();
  });
  it('shows only a grayed icon where no lead price is displayed', () => {
    access.guest = true;
    const { container } = render(<RewardIcons types={{ form: true, whatsapp: true, phone: true, closing: true }} zeroTypes={{ form: false, whatsapp: false, phone: true, closing: false }} />);
    expect(screen.getByText('ללא עמלה')).toBeTruthy();
    expect(screen.queryByText('למתווכים בלבד')).toBeNull();
    expect(container.querySelector('span[title="שיחת טלפון"].lead-no-fee')).toBeTruthy();
    // The restricted closing stays a gray trophy that still explains licensing.
    fireEvent.click(screen.getByLabelText('סגירת עסקה'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it.each(['guest', 'super_admin', 'developer', 'property_owner', 'property_seeker', 'affiliate', 'agent'])('redacts closing prices even if supplied to the indicator for %s', role => {
    access.guest = role === 'guest'; access.roles = [role]; access.admin = role === 'super_admin';
    render(<RewardIcons types={{ closing: true }} prices={{ closing: 10000 }} zeroTypes={{ closing: true }} />);
    expect(screen.queryByText('₪10,000')).toBeNull();
    expect(screen.queryByText('ללא עמלה')).toBeNull();
    fireEvent.click(screen.getByLabelText('סגירת עסקה'));
    expect(screen.queryByRole('dialog')).toBeNull();
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
  it('keeps the restricted closing trophy in its price color with a gray hint', () => {
    const { container } = render(<RewardIcons types={{ closing: true }} closingLevel={2} label={null} />);
    const trophy = screen.getByLabelText('סגירת עסקה');
    expect(trophy.getAttribute('class')).toContain('closing-level-2');
    expect(screen.getByText('למתווכים').className).toContain('lead-no-fee');
    expect(container.querySelector('span[title="סגירת עסקה"].text-muted-foreground')).toBeNull();
    cleanup();
    // Without a known level the trophy still shows the gold closing tone, never gray.
    render(<RewardIcons types={{ closing: true }} label={null} />);
    expect(screen.getByLabelText('סגירת עסקה').getAttribute('class')).toContain('text-lead-closing');
  });
  it('closing prices always render as whole amounts without decimals', () => {
    access.allowed = true;
    render(<RewardIcons types={{ closing: true }} prices={{ closing: 720.6 }} closingLevel={1} label={null} />);
    expect(screen.getByText('₪721')).toBeTruthy();
    expect(screen.queryByText(/720\.6/)).toBeNull();
  });
});