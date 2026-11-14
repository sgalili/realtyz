import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LeadPricingDialog, { LeadPricingInfo } from './LeadPricingDialog';
import type { MarketplaceListing } from '@/hooks/useAffiliate';

const state = vi.hoisted(() => ({ editable: null as unknown, level4Unlocked: false, roles: [] as string[], user: { id: 'poster' } as { id: string } | null }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ roles: state.roles, isSuperAdmin: state.roles.includes('super_admin') }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { editable: state.editable, details: { daily_lead_cap: 12 } }, isLoading: false, isError: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: '/', search: '' }) }));
vi.mock('./RewardDialog', () => ({ RewardDialog: () => <div role="dialog"><label>הגדרות לידים<input aria-label="מחיר ליד" /></label></div> }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: state.level4Unlocked }) }));
const listing = { tier1_amount: 100, tier2_amount: 150, tier3_amount: 0, tier4_amount: 10000 } as MarketplaceListing;
afterEach(() => { cleanup(); state.level4Unlocked = false; state.roles = []; state.user = { id: 'poster' }; });
describe('partner lead pricing information', () => {
  it.each(['guest', 'super_admin', 'agent'])('includes known zero types without exposing restricted closing prices for %s', (role) => {
    state.roles = [role];
    if (role === 'guest') state.user = null;
    render(<LeadPricingInfo listing={listing} details={{}} rewardTypes={{ form: true, whatsapp: true, phone: false, closing: false }} />);
    expect(screen.getAllByText('₪0')).toHaveLength(1);
    expect(screen.getByText('ליד מסונן בשיחת טלפון')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'עמלות סגירה' })).toBeNull();
    expect(screen.queryByText('₪8,000')).toBeNull();
  });
  it.each(['developer', 'affiliate', 'property_owner', 'super_admin'])('hides the entire closing section for an unlicensed %s', role => {
    state.roles = [role];
    render(<LeadPricingInfo listing={listing} details={{}} rewardTypes={{ closing: true, form: true }} />);
    expect(screen.queryByRole('region', { name: 'עמלות סגירה' })).toBeNull();
    expect(screen.queryByText('₪8,000')).toBeNull();
    expect(screen.getByText('₪80')).toBeTruthy();
  });
  it('opens all lead details from the closing icon without a second popup', () => {
    state.editable = null;
    render(<LeadPricingDialog listing={listing} />);
    fireEvent.click(screen.getByLabelText('סגירת עסקה'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('שדות מטופס בעמוד נחיתה')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'עמלות סגירה' })).toBeNull();
    expect(screen.queryByText('₪8,000')).toBeNull();
  });
  it('does not expose daily targets or closing details to guests', () => {
    state.user = null;
    state.level4Unlocked = true;
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { lead_daily_limits: { whatsapp: 4 } } }} rewardTypes={{ whatsapp: true, closing: true }} />);
    expect(screen.queryByText('4')).toBeNull();
    expect(screen.queryByRole('region', { name: 'עמלות סגירה' })).toBeNull();
    expect(screen.queryByText('₪120')).toBeNull();
    expect(screen.queryByText('₪8,000')).toBeNull();
    expect(screen.getByText('שדות מטופס בעמוד נחיתה')).toBeTruthy();
  });
  it('does not fabricate a shekel payout when a percentage agreement has no property price', () => {
    state.level4Unlocked = true;
    render(<LeadPricingInfo closingOnly listing={{ ...listing, tier4_amount: 1, tier4_type: 'percent' }} details={{}} />);
    expect(screen.getByText('מחיר לא זמין')).toBeTruthy();
    expect(screen.queryByText('₪0')).toBeNull();
  });
  it('shows only absolute net shekels for a percentage closing agreement', () => {
    state.level4Unlocked = true;
    render(<LeadPricingInfo closingOnly listing={{ ...listing, tier4_amount: 1, tier4_type: 'percent' }} details={{ asking_price: 3000000 }} />);
    expect(screen.getAllByText('₪24,000')).toHaveLength(2);
    expect(screen.getByText('₪30,000')).toBeTruthy();
    expect(screen.getByText('₪6,000')).toBeTruthy();
    expect(screen.queryByText('0.8%')).toBeNull();
  });
  it('shows closing net as whole shekels for fixed amounts, without decimals', () => {
    state.level4Unlocked = true;
    render(<LeadPricingInfo listing={{ ...listing, tier4_amount: 10000.5, tier4_type: 'fixed' }} details={{}} />);
    expect(screen.getAllByText('₪8,000').length).toBeGreaterThan(0);
    expect(screen.queryByText(/8,000\.4/)).toBeNull();
  });
  it('does not expose closing gross or split amounts to an unauthorized viewer', () => {
    render(<LeadPricingInfo closingOnly listing={{ ...listing, tier4_amount: 1, tier4_type: 'percent' }} details={{}} />);
    expect(screen.queryByText('0.8%')).toBeNull();
    expect(screen.queryByText('0.2%')).toBeNull();
    expect(screen.queryByText('1%')).toBeNull();
  });
  it('keeps inventory gross prices and percentage prices consistent with clicked labels', () => {
    render(<LeadPricingInfo gross listing={{ ...listing, tier3_amount: 2, tier3_type: 'percent' }} details={{ asking_price: 3000000, contact_options: { lead_daily_limits: { form: 7 } } }} />);
    expect(screen.getByText('₪100')).toBeTruthy();
    expect(screen.getByText('₪60,000')).toBeTruthy();
    expect(screen.queryByText('7')).toBeNull();
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
    expect(screen.queryByText('מקס׳ ב־24 שעות')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('shows net rewards and questions but not advertiser daily targets', () => {
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { lead_daily_limits: { form: 12, whatsapp: 4 }, questions: ['מה התקציב שלך?'] } }} />);
    expect(screen.queryByText('12')).toBeNull();
    expect(screen.queryByText('4')).toBeNull();
    expect(screen.getByText('₪80')).toBeTruthy();
    expect(screen.getByText('₪120')).toBeTruthy();
    expect(screen.queryByText('מה התקציב שלך?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'שאלות הסינון של המפרסם' }));
    expect(screen.getByText('מה התקציב שלך?')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'עמלות סגירה' })).toBeNull();
    expect(screen.queryByText('ליד מסונן בשיחת טלפון')).toBeNull();
  });
  it('summarizes form fields in one sentence without a daily target', () => {
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { form_fields: [{ id: 'field', label: 'מועד כניסה', type: 'single', required: true, options: ['מיידי', 'בהמשך'] }] } }} />);
    expect(screen.queryByText('ללא מגבלה')).toBeNull();
    expect(screen.getByText('שדות הטופס שהגדיר המפרסם')).toBeTruthy();
    expect(screen.queryByText(/מועד כניסה/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('keeps closing prices available to a server-authorized broker even with additional roles', () => {
    state.roles = ['agent', 'developer', 'affiliate'];
    state.level4Unlocked = true;
    render(<LeadPricingInfo listing={listing} details={{}} />);
    expect(screen.getByRole('region', { name: 'עמלות סגירה' })).toBeTruthy();
    expect(screen.getAllByText('₪8,000').length).toBeGreaterThan(0);
  });
});