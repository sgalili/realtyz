import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { OfficialBrokerInvitationDialog, OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';
const state = vi.hoisted(() => ({ invoke: vi.fn(), status: 'APPROVED', eligible: true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke }, rpc: async () => ({ data: { stage: 'not_invited', pending_properties: 2 }, error: null }) } }));
vi.mock('@/lib/officialWa', () => ({ getOfficialWaNumber: async () => '972537983832' }));
vi.mock('@/hooks/useCampaignPricing', () => ({ useCampaignPricing: () => ({ data: [{ action_key: 'whatsapp_marketing', price_agorot: 100 }] }) }));
afterEach(() => { cleanup(); state.invoke.mockReset(); state.status = 'APPROVED'; state.eligible = true; });
function mockInvocations() {
  state.invoke.mockImplementation((_name, { body }) => {
    if (body.action === 'whatsapp_eligibility') return Promise.resolve({ data: { eligible: state.eligible }, error: null });
    if (body.action === 'register') state.status = 'PENDING';
    return Promise.resolve({ data: { status: state.status, demo_link: 'https://toraff.co.il/demo/broker' }, error: null });
  });
}
function mount() {
  mockInvocations();
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
it('keeps the broker invitation trigger unavailable without a saved personal WhatsApp', async () => {
  state.eligible = false;
  mockInvocations();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OfficialBrokerInvitationDialog broker={{ id: 'broker-2', full_name: 'Dana' }} /></QueryClientProvider>);
  const trigger = await screen.findByRole('button', { name: 'שליחת הזמנה רשמית ב־WhatsApp' });
  await waitFor(() => expect(trigger).toBeDisabled());
  fireEvent.click(trigger);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(state.invoke.mock.calls.some(([, { body }]) => body.action === 'send')).toBe(false);
});
it('does not enable sending after consent when the saved WhatsApp is missing', async () => {
  state.eligible = false;
  mount();
  const send = await screen.findByRole('button', { name: 'שליחת הזמנה' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'הנמען הסכים לקבל הזמנה ב־WhatsApp' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('לא נעשה שימוש בטלפון איש הקשר או בטלפון הכניסה'));
  expect(send).toBeDisabled();
  fireEvent.click(send);
  expect(state.invoke.mock.calls.some(([, { body }]) => body.action === 'send')).toBe(false);
});