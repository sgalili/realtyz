import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LeadDirectionTabs from './LeadDirectionTabs';
import SentPartnerLeads from './SentPartnerLeads';

const mocks = vi.hoisted(() => ({ affiliate: true, loading: false, error: false, licensed: false, submissions: [] as any[], incoming: vi.fn(() => 7) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isAffiliate: mocks.affiliate, loading: mocks.loading, error: mocks.error }) }));
vi.mock('@/components/billing/SidebarWalletIndicator', () => ({ useIncomingLeadsCount: mocks.incoming }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: mocks.licensed }) }));
vi.mock('@/hooks/useAffiliate', () => ({
  useMySubmissions: () => ({ data: mocks.submissions, isLoading: false, isError: false }),
  SUBMISSION_STATUS_LABELS: { submitted: 'הוגש', verified: 'אומת', closed: 'עסקה נסגרה' },
  SETTLEMENT_LABELS: { paid: 'שולם', approved: 'אושר לתשלום' },
}));

describe('lead direction tabs', () => {
  beforeEach(() => { mocks.affiliate = true; mocks.loading = false; mocks.error = false; mocks.licensed = false; mocks.submissions = []; });
  const show = (path = '/lead-crm?filter=untreated') => render(<MemoryRouter initialEntries={[path]}><LeadDirectionTabs><p>לידים במרחב הנוכחי</p></LeadDirectionTabs></MemoryRouter>);
  it('defaults to received and lets an existing partner view sent leads then return', () => {
    show();
    expect(mocks.incoming).toHaveBeenCalledWith('workspace');
    expect(screen.getByText('לידים במרחב הנוכחי')).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '0 לידים שמכרתי' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('לא מכרת לידים עדיין')).toBeVisible();
    expect(screen.queryByText('לידים במרחב הנוכחי')).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '7 לידים שקיבלתי' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('לידים במרחב הנוכחי')).toBeVisible();
  });
  it.each([{ affiliate: false }, { loading: true }, { error: true }])('hides partner tabs without verified membership: %s', (state) => {
    Object.assign(mocks, state);
    show('/lead-crm?direction=sent');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('לידים במרחב הנוכחי')).toBeVisible();
  });
  it('restores the sent tab from the URL', () => {
    show('/lead-crm?filter=untreated&direction=sent');
    expect(screen.getByRole('tab', { name: '0 לידים שמכרתי' })).toHaveAttribute('data-state', 'active');
  });
  it('shows authorized submission rows and searches without revealing closing status to unlicensed partners', () => {
    mocks.submissions = [{ id: '1', lead_name: 'ליד בדיקה', status: 'closed', partner_net_amount: 4, settlement_status: 'paid', created_at: '2026-10-11T05:00:00Z' }];
    render(<MemoryRouter><SentPartnerLeads /></MemoryRouter>);
    expect(screen.getByText('ליד בדיקה')).toBeVisible();
    expect(screen.getByText('אומת')).toBeVisible();
    expect(screen.queryByText('עסקה נסגרה')).not.toBeInTheDocument();
    expect(screen.getByText('100 קרדיטים')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'לא קיים' } });
    expect(screen.getByText('לא נמצאו לידים בחיפוש.')).toBeVisible();
  });
});