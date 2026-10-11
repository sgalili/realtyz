import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadPricingInfo } from './LeadPricingDialog';
import type { MarketplaceListing } from '@/hooks/useAffiliate';

vi.mock('./RewardDialog', () => ({ RewardDialog: () => null }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: false }) }));
const listing = { tier1_amount: 100, tier2_amount: 150, tier3_amount: 0, tier4_amount: 10000 } as MarketplaceListing;
afterEach(cleanup);
describe('partner lead pricing information', () => {
  it('shows offered types, exact net rewards, cap and publisher questions without closing data', () => {
    render(<LeadPricingInfo listing={listing} details={{ daily_lead_cap: 12, contact_options: { questions: ['מה התקציב שלך?'] } }} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('₪80')).toBeTruthy();
    expect(screen.getByText('₪120')).toBeTruthy();
    expect(screen.getByText('מה התקציב שלך?')).toBeTruthy();
    expect(screen.queryByText(/סגירת עסקה/)).toBeNull();
    expect(screen.queryByText('ליד מסונן בשיחת טלפון')).toBeNull();
  });
  it('shows unlimited cap and custom form field requirements and choices', () => {
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { form_fields: [{ id: 'field', label: 'מועד כניסה', type: 'single', required: true, options: ['מיידי', 'בהמשך'] }] } }} />);
    expect(screen.getByText('ללא מגבלה')).toBeTruthy();
    expect(screen.getByText(/מועד כניסה · בחירה יחידה · חובה · מיידי, בהמשך/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});