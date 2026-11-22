import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';
const state = vi.hoisted(() => ({ invoke: vi.fn(), status: 'APPROVED' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke }, rpc: async () => ({ data: { stage: 'not_invited', pending_properties: 2 }, error: null }) } }));
vi.mock('@/lib/officialWa', () => ({ getOfficialWaNumber: async () => '972537983832' }));
vi.mock('@/hooks/useCampaignPricing', () => ({ useCampaignPricing: () => ({ data: [{ action_key: 'whatsapp_marketing', price_agorot: 100 }] }) }));
afterEach(() => { cleanup(); state.invoke.mockReset(); state.status = 'APPROVED'; });
function mount() {
  state.invoke.mockImplementation((_name, { body }) => {
    if (body.action === 'register') state.status = 'PENDING';
    return Promise.resolve({ data: { status: state.status, demo_link: 'https://toraff.co.il/demo/broker' }, error: null });
  });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OfficialBrokerInvitationPanel broker={{ id: 'broker-1', full_name: 'Dana' }} useDiscoveredWhatsApp onClose={() => {}} /></QueryClientProvider>);
}
it('sends only after consent and approval, binding the saved WhatsApp contact rather than a login phone', async () => {
  mount();
  const send = await screen.findByRole('button', { name: 'שליחת הזמנה' });
  expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'הנמען הסכים לקבל הזמנה ב־WhatsApp' }));
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.click(send);
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('admin-broker-invitation', { body: expect.objectContaining({ action: 'send', broker_id: 'broker-1', use_discovered_whatsapp: true, consent: true, demo: true }) }));
});
it('registering new copy submits approval only and cannot send an invitation', async () => {
  state.status = 'NOT_REGISTERED'; mount();
  fireEvent.click(await screen.findByRole('button', { name: 'הגשת הנוסח לאישור Meta' }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('admin-broker-invitation', { body: { action: 'register', broker_id: 'broker-1' } }));
  expect(state.invoke.mock.calls.some(([, { body }]) => body.action === 'send')).toBe(false);
});