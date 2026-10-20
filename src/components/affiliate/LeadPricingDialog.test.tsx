import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LeadPricingDialog, { LeadPricingInfo } from './LeadPricingDialog';
import type { MarketplaceListing } from '@/hooks/useAffiliate';

const state = vi.hoisted(() => ({ editable: null as unknown }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { editable: state.editable, details: { daily_lead_cap: 12 } }, isLoading: false, isError: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'poster' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace' }));
vi.mock('./RewardDialog', () => ({ RewardDialog: () => <div role="dialog"><label>הגדרות לידים<input aria-label="מחיר ליד" /></label></div> }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: false }) }));
const listing = { tier1_amount: 100, tier2_amount: 150, tier3_amount: 0, tier4_amount: 10000 } as MarketplaceListing;
afterEach(cleanup);
describe('partner lead pricing information', () => {
  it('keeps inventory gross prices and percentage prices consistent with clicked labels', () => {
    render(<LeadPricingInfo gross listing={{ ...listing, tier3_amount: 2, tier3_type: 'percent' }} details={{ contact_options: { lead_daily_limits: { form: 7 } } }} />);
    expect(screen.getByText('₪100')).toBeTruthy();
    expect(screen.getByText('2%')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });
  it('opens editable settings when the workspace-scoped authored row is authorized', () => {
    state.editable = { id: 'listing' };
    render(<LeadPricingDialog listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: 'תמחור לידים' }));
    expect(screen.getByRole('textbox', { name: 'מחיר ליד' })).toBeTruthy();
    state.editable = null;
  });
  it('opens read-only lead details for a partner without pricing inputs', () => {
    state.editable = null;
    render(<LeadPricingDialog listing={listing} />);
    fireEvent.click(screen.getByRole('button', { name: 'תמחור לידים' }));
    expect(screen.getAllByText('מקס׳ ב־24 שעות')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('shows offered types, exact net rewards, cap and publisher questions without closing data', () => {
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { lead_daily_limits: { form: 12, whatsapp: 4 }, questions: ['מה התקציב שלך?'] } }} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('₪80')).toBeTruthy();
    expect(screen.getByText('₪120')).toBeTruthy();
    expect(screen.getByText('מה התקציב שלך?')).toBeTruthy();
    expect(screen.queryByText(/סגירת עסקה/)).toBeNull();
    expect(screen.queryByText('ליד מסונן בשיחת טלפון')).toBeNull();
  });
  it('shows unlimited cap and custom form field requirements and choices', () => {
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { form_fields: [{ id: 'field', label: 'מועד כניסה', type: 'single', required: true, options: ['מיידי', 'בהמשך'] }] } }} />);
    expect(screen.getAllByText('ללא מגבלה')).toHaveLength(2);
    expect(screen.getByText(/מועד כניסה · בחירה יחידה · חובה · מיידי, בהמשך/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});