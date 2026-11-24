import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from '@/lib/router-compat';
import { afterEach, expect, it, vi } from 'vitest';
import { ImportedLicenseGate } from './ImportedLicenseGate';
const state = vi.hoisted(() => ({ rpc: vi.fn(), verify: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'imported-broker' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/lib/brokerLicense', () => ({ brokerLicenseDigits: (value: string) => value.replace(/\D/g, ''), verifyBrokerLicense: state.verify }));
afterEach(() => { cleanup(); state.rpc.mockReset(); state.verify.mockReset(); sessionStorage.clear(); });
it('handles a failed review request after a missing license and keeps the page and retry available', async () => {
  state.verify.mockRejectedValue(new Error('license_not_found'));
  state.rpc.mockImplementation((name: string) => name === 'imported_broker_license_state'
    ? Promise.resolve({ data: { status: 'unverified', license_number: '318317', days_left: 14 }, error: null })
    : Promise.reject(new Error('review request offline')));
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ImportedLicenseGate><main aria-label="account" /></ImportedLicenseGate></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'אימות הרישיון' }));
  await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('request_imported_license_review', { _license: '318317' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'אימות הרישיון' })).toBeEnabled());
  expect(screen.getByRole('main', { hidden: true })).toBeInTheDocument();
  expect(state.verify).toHaveBeenCalledWith('318317', 'verify');
});