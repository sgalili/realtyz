import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerWhatsAppContact } from './BrokerWhatsAppContact';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('./OfficialBrokerInvitationDialog', () => ({ OfficialBrokerInvitationPanel: ({ useDiscoveredWhatsApp }: { useDiscoveredWhatsApp: boolean }) => <output data-testid="official-recipient">{String(useDiscoveredWhatsApp)}</output> }));
afterEach(() => { cleanup(); state.invoke.mockReset(); });
function setup(status: string | null = null) {
  state.invoke.mockResolvedValue({ data: { job: status ? { id: 'job', status, attempts: 1, last_error: null } : null }, error: null });
  const client=new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BrokerWhatsAppContact brokerId="broker-id" name="Broker" phone="972502222222" /></QueryClientProvider>);
  return client;
}
it('queues discovery only by default', async () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'גילוי WhatsApp של Broker' }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker', { body: { action: 'enqueue', broker_id: 'broker-id' } }));
  expect(state.invoke.mock.calls.every(([, args]) => ['enqueue', 'status'].includes(args.body.action) && !('outreach' in args.body))).toBe(true);
});
it('blocks another job while discovery is running', async () => {
  setup('running');
  await waitFor(() => expect(screen.getByRole('button', { name: 'גילוי WhatsApp של Broker' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'גילוי WhatsApp של Broker' }));
  expect(state.invoke.mock.calls.filter(([,args])=>args.body.action==='enqueue')).toHaveLength(0);
});
it('uses the saved WhatsApp contact through the official sender, not a private-device link', () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'WhatsApp רשמי אל Broker' }));
  expect(screen.getByTestId('official-recipient')).toHaveTextContent('true');
  expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();
});
it('unlocks the same discovery control when the tracked job completes', async()=>{
  const client=setup('running');
  fireEvent.click(screen.getByRole('button',{name:'גילוי WhatsApp של Broker'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'גילוי WhatsApp של Broker'})).toBeDisabled());
  await act(async()=>{client.setQueryData(['broker-whatsapp-job','broker-id'],{job:{id:'job',status:'completed',attempts:1,last_error:null}});});
  await waitFor(()=>expect(screen.getByRole('button',{name:'גילוי WhatsApp של Broker'})).toBeEnabled());
});