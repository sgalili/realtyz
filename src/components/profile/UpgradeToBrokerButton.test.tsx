import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpgradeToBrokerButton } from './UpgradeToBrokerButton';

const state = vi.hoisted(() => ({ verified: false, license: '', pending: false, reads: [] as string[], submissions: 0 }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'signed-in-account' } }) }));
vi.mock('@/components/auth/BrokerLicenseField', () => ({ BrokerLicenseField: () => <input aria-label="מספר רישיון חדש" /> }));
vi.mock('@/components/auth/BrokerCertificateCheck', () => ({ BrokerCertificateCheck: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: async (name: string, args: { _user_id?: string }) => {
    if (name === 'publisher_sms_verified') return { data: false, error: null };
    if (name === 'partner_can_view_closing') { state.reads.push(args._user_id ?? ''); return { data: state.verified, error: null }; }
    state.submissions++; return { data: null, error: null };
  },
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: (field: string, value: string) => { if (field === 'id' || field === 'user_id') state.reads.push(value); return chain; },
      maybeSingle: async () => ({ data: table === 'profiles' ? { broker_license_number: state.license } : table === 'broker_upgrade_requests' && state.pending ? { id: 'request', license_number: state.license } : null, error: null }),
    }; return chain;
  },
} }));
const mount = (profileOwnerId?: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UpgradeToBrokerButton profileOwnerId={profileOwnerId} /></QueryClientProvider>);
beforeEach(() => { state.verified = false; state.license = ''; state.pending = false; state.reads = []; state.submissions = 0; });
afterEach(cleanup);

it('allows an unverified account without a license to open verification', async () => {
  mount();
  await waitFor(() => expect(state.reads.length).toBe(4));
  fireEvent.click(screen.getByRole('button', { name: 'שדרג למתווך מורשה' }));
  expect(screen.queryByRole('textbox', { name: 'מספר רישיון חדש' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'יש לי רישיון' }));
  expect(screen.getByRole('textbox', { name: 'מספר רישיון חדש' })).toBeInTheDocument();
  expect(state.reads.every(id => id === 'signed-in-account')).toBe(true);
});
it('does not treat an entered license as verified status', async () => {
  state.license = '12345'; mount();
  await screen.findByText('12345');
  expect(screen.getByRole('button', { name: 'שדרג למתווך מורשה' })).toBeEnabled();
});
it('keeps pending requests accessible without permitting duplicate submission', async () => {
  state.pending = true; state.license = '54321'; mount();
  await screen.findByText('54321');
  fireEvent.click(screen.getByRole('button', { name: 'שדרג למתווך מורשה' }));
  expect(screen.queryByRole('textbox', { name: 'מספר רישיון חדש' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'שליחת הבקשה לאישור' })).toBeNull();
  expect(state.submissions).toBe(0);
});
it('hides upgrade only after active verification is confirmed by the server', async () => {
  state.verified = true; mount();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'שדרג למתווך מורשה' })).toBeNull());
});
it('checks the displayed workspace owner without offering submission as another person', async () => {
  mount('partner-only-owner');
  await waitFor(() => expect(state.reads.length).toBe(2));
  expect(state.reads).toEqual(['partner-only-owner', 'partner-only-owner']);
  fireEvent.click(screen.getByRole('button', { name: 'שדרג למתווך מורשה' }));
  expect(screen.queryByRole('textbox', { name: 'מספר רישיון חדש' })).toBeNull();
  expect(state.submissions).toBe(0);
});