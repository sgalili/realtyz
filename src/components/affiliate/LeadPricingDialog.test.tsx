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
    expect(screen.getAllByText('ללא עמלה')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /קורס הכנה/ })).toBeTruthy();
    expect(screen.getByText('ליד מסונן בשיחת טלפון')).toBeTruthy();
    expect(screen.getByText('סגירת עסקה')).toBeTruthy();
    expect(screen.queryByText('₪8,000')).toBeNull();
  });
  it('keeps the restricted closing trophy in its price color with a gray hint', () => {
    state.user = null;
    render(<LeadPricingInfo listing={{ ...listing, tier4_amount: 1.5, tier4_type: 'percent' }} details={{ asking_price: 3_000_000, deal_type: 'sale' }} rewardTypes={{ closing: true }} closingLevel={2} />);
    expect(screen.getByLabelText('סגירת עסקה').className).toContain('closing-level-2');
    expect(screen.getByText('למתווכים').className).toContain('lead-no-fee');
    cleanup();
    // An unknown level still shows the gold closing tone rather than a gray icon.
    render(<LeadPricingInfo listing={listing} details={{}} rewardTypes={{ closing: true }} />);
    expect(screen.getByLabelText('סגירת עסקה').className).toContain('text-lead-closing');
  });
  it('opens all lead details and inline licensing from the closing icon without a second popup', () => {
    state.editable = null;
    render(<LeadPricingDialog listing={listing} />);
    fireEvent.click(screen.getByLabelText('סגירת עסקה'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('שדות מטופס בעמוד נחיתה')).toBeTruthy();
    expect(screen.getByRole('link', { name: /קורס הכנה/ }).getAttribute('href')).toContain('easytest.co.il');
    expect(screen.getByRole('link', { name: /הרשמה למבחן/ }).getAttribute('href')).toBe('https://www.gov.il/he/service/registration_for_examination_in_real_estate_law');
    expect(screen.queryByText('₪8,000')).toBeNull();
  });
  it('shows configured guest types and exact daily limits without any reward prices', () => {
    state.user = null;
    state.level4Unlocked = true;
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { lead_daily_limits: { whatsapp: 4 } } }} rewardTypes={{ whatsapp: true, closing: true }} />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('סגירת עסקה')).toBeTruthy();
    expect(screen.queryByText('₪120')).toBeNull();
    expect(screen.queryByText('₪8,000')).toBeNull();
    expect(screen.getByText('שדות מטופס בעמוד נחיתה')).toBeTruthy();
  });
  it('shows 0.8% net and 0.2% platform share of a 1% closing fee for an authorized broker', () => {
    state.level4Unlocked = true;
    render(<LeadPricingInfo closingOnly listing={{ ...listing, tier4_amount: 1, tier4_type: 'percent' }} details={{}} />);
    expect(screen.getAllByText('0.8%')).toHaveLength(2);
    expect(screen.getByText('0.2%')).toBeTruthy();
    expect(screen.getByText('1%')).toBeTruthy();
  });
  it('shows the partner shekel value next to a percentage closing fee', () => {
    state.level4Unlocked = true;
    render(<LeadPricingInfo closingOnly listing={{ ...listing, tier4_amount: 1, tier4_type: 'percent' }} details={{ asking_price: 3000000 }} />);
    const closingAmount = screen.getAllByText('0.8%')[0];
    expect(closingAmount.textContent).toBe('0.8%(₪24,000)');
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
    expect(screen.queryByText('מה התקציב שלך?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'שאלות הסינון של המפרסם' }));
    expect(screen.getByText('מה התקציב שלך?')).toBeTruthy();
    expect(screen.getByRole('link', { name: /קורס הכנה/ })).toBeTruthy();
    expect(screen.queryByText('ליד מסונן בשיחת טלפון')).toBeNull();
  });
  it('shows unlimited cap and custom form field requirements and choices', () => {
    render(<LeadPricingInfo listing={listing} details={{ contact_options: { form_fields: [{ id: 'field', label: 'מועד כניסה', type: 'single', required: true, options: ['מיידי', 'בהמשך'] }] } }} />);
    expect(screen.getAllByText('ללא מגבלה')).toHaveLength(2);
    expect(screen.getByText(/מועד כניסה · בחירה יחידה · חובה · מיידי, בהמשך/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});