import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerOnboarding } from './PartnerOnboarding';
const mocks = vi.hoisted(() => ({ accept: vi.fn(), label: 'מתווך' }));
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ acceptTerms: mocks.accept, isAcceptingTerms: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test' } }) }));
vi.mock('@/hooks/useAccountIdentity', () => ({ useAccountIdentity: () => ({ label: mocks.label }) }));
vi.mock('@/hooks/usePartnerConsent', () => ({ usePartnerConsent: () => ({ data: false, isLoading: false }) }));
vi.mock('@/hooks/useUserRole', () => ({ userRolesQueryKey: (id: string) => ['roles', id] }));
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); mocks.label = 'מתווך'; });
function setup() {
  const done = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><PartnerOnboarding onComplete={done} /></QueryClientProvider>);
  return done;
}
const join = () => screen.getByRole('button', { name: 'הצטרפות לרשת השותפים' });
const checkAll = () => screen.getAllByRole('checkbox').forEach(c => fireEvent.click(c));
describe('partner consent', () => {
  it('brokers must accept terms, privacy, commissions and brokerage terms', async () => {
    mocks.accept.mockResolvedValue(undefined);
    const done = setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    const boxes = screen.getAllByRole('checkbox');
    boxes.slice(0, 3).forEach(c => fireEvent.click(c));
    expect(join()).toBeDisabled();
    fireEvent.click(boxes[3]);
    fireEvent.click(join());
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
  });
  it('non-brokers get three consents without brokerage terms', () => {
    mocks.label = 'מפרסם';
    setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.queryByText(/תנאי התיווך/)).toBeNull();
  });
  it('does not unlock partner entry when consent persistence fails', async () => {
    mocks.accept.mockRejectedValue(new Error('failed'));
    const done = setup(); checkAll();
    fireEvent.click(join());
    await screen.findByRole('alert');
    expect(done).not.toHaveBeenCalled();
  });
});
