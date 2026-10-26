import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), play: vi.fn(), user: 'account-one' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/rewardFeedback', () => ({ prepareRewardSounds: vi.fn(), playRewardSound: mocks.play, isEarnedCredit: (row: { type: string; amount_ils: number }) => ['affiliate_lead_reward','closing_commission_payout','referral_reward'].includes(row.type) && row.amount_ils > 0 }));
import { useEarningsFeedback } from './useEarningsFeedback';
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  renderHook(() => useEarningsFeedback(), { wrapper });
  return client;
}
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); mocks.user = 'account-one'; });
describe('account-only earned-money feedback', () => {
  it('starts a baseline without fetching or playing old rewards', async () => {
    const client = mount();
    await waitFor(() => expect(client.getQueryState(['account-earnings-feedback','account-one'])?.status).toBe('success'));
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.play).not.toHaveBeenCalled();
  });
  it('plays a fresh confirmed commission exactly once across repeat polls', async () => {
    sessionStorage.setItem('toraff:earnings-cursor:account-one', JSON.stringify({ since: '2026-10-26T07:00:00Z', seen: [] }));
    mocks.rpc.mockResolvedValue({ data: [{ id: 'reward-1', type: 'closing_commission_payout', amount_ils: 10, created_at: '2026-10-26T07:01:00Z' }], error: null });
    const client = mount();
    await waitFor(() => expect(mocks.play).toHaveBeenCalledExactlyOnceWith('earnings'));
    await client.refetchQueries({ queryKey: ['account-earnings-feedback','account-one'] });
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });
  it('does not play signup grants or topups returned alongside earnings', async () => {
    sessionStorage.setItem('toraff:earnings-cursor:account-one', JSON.stringify({ since: '2026-10-26T07:00:00Z', seen: [] }));
    mocks.rpc.mockResolvedValue({ data: [{ id: 'bonus', type: 'launch_bonus', amount_ils: 20 }, { id: 'topup', type: 'topup', amount_ils: 50 }], error: null });
    const client = mount();
    await waitFor(() => expect(client.getQueryState(['account-earnings-feedback','account-one'])?.status).toBe('success'));
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it('does not reuse another account cursor', async () => {
    sessionStorage.setItem('toraff:earnings-cursor:account-one', JSON.stringify({ since: '2026-10-26T07:00:00Z', seen: [] }));
    mocks.user = 'account-two'; const client = mount();
    await waitFor(() => expect(client.getQueryState(['account-earnings-feedback','account-two'])?.status).toBe('success'));
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.play).not.toHaveBeenCalled();
  });
});