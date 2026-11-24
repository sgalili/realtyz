import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerWhatsAppContact } from './BrokerWhatsAppContact';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/hooks/useSuperAdminGate', () => ({ useSuperAdminGate: () => ({ enabled: true, uid: 'admin' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock('./OfficialBrokerInvitationDialog', () => ({ OfficialBrokerInvitationPanel: ({ useDiscoveredWhatsApp }: { useDiscoveredWhatsApp: boolean }) => <output data-testid="official-recipient">{String(useDiscoveredWhatsApp)}</output> }));
afterEach(() => { cleanup(); state.invoke.mockReset(); });
function setup(status: string | null = null, phone: string | null = null) {
  state.invoke.mockResolvedValue({ data: { job: status ? { id: 'job', status, attempts: 1, last_error: null } : null }, error: null });
  const client=new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BrokerWhatsAppContact brokerId="broker-id" name="Broker" phone={phone} /></QueryClientProvider>);
  return client;
}
it('queues discovery only by default', async () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'גילוי WhatsApp של Broker' }));
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker', { body: { action: 'enqueue', broker_id: 'broker-id' } }));
  expect(state.invoke.mock.calls.every(([, args]) => ['enqueue', 'status'].includes(args.body.action) && !('outreach' in args.body))).toBe(true);
});
it('reads a completed persisted WhatsApp contact into its own slot even without tracking', async () => {
  state.invoke.mockResolvedValue({ data: { job: { id: 'job', status: 'completed', attempts: 1 }, contact: { whatsapp_phone: '972503333333' } }, error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BrokerWhatsAppContact brokerId="broker-id" name="Broker" phone={null} /></QueryClientProvider>);
  expect(await screen.findByRole('button', { name: 'עריכת וואטסאפ של Broker' })).toHaveTextContent('050-3333333');
  expect(screen.queryByRole('button', { name: 'הוספת וואטסאפ של Broker' })).toBeNull();
});
it('shows only the invitation button, not discovery, once a personal WhatsApp is saved', async () => {
  setup(null, '972502222222');
  expect(screen.getByRole('button', { name: 'WhatsApp רשמי אל Broker' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'גילוי WhatsApp של Broker' })).toBeNull();
});
it('shows only discovery, never the invitation button, without a saved WhatsApp', () => {
  setup();
  expect(screen.getByRole('button', { name: 'גילוי WhatsApp של Broker' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'WhatsApp רשמי אל Broker' })).toBeNull();
});
it('blocks another job while discovery is running', async () => {
  setup('running');
  await screen.findByRole('button', { name: 'פרטי גילוי וואטסאפ של Broker' });
  expect(screen.queryByRole('button', { name: 'גילוי WhatsApp של Broker' })).toBeNull();
  expect(state.invoke.mock.calls.filter(([,args])=>args.body.action==='enqueue')).toHaveLength(0);
});
it('blocks another discovery while the dedicated scanner inquiry is awaiting a reply', async () => {
  state.invoke.mockImplementation((fn) => Promise.resolve({ data: fn === 'broker-whatsapp-scanner' ? { job: { id: 'inquiry', status: 'awaiting_reply' } } : { job: { id: 'source', status: 'not_found' } }, error: null }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrokerWhatsAppContact brokerId="broker-id" name="Broker" /></QueryClientProvider>);
  await screen.findByRole('button', { name: 'פרטי גילוי וואטסאפ של Broker' });
  expect(screen.queryByRole('button', { name: 'גילוי WhatsApp של Broker' })).toBeNull();
  expect(state.invoke.mock.calls.some(([,args]) => args.body.action === 'enqueue')).toBe(false);
});
it('uses the saved WhatsApp contact through the official sender, not a private-device link', () => {
  setup(null, '972502222222'); fireEvent.click(screen.getByRole('button', { name: 'WhatsApp רשמי אל Broker' }));
  expect(screen.getByTestId('official-recipient')).toHaveTextContent('true');
  expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();
});
it('unlocks the same discovery control when the tracked job completes', async()=>{
  const client=setup('running');
  await screen.findByRole('button',{name:'פרטי גילוי וואטסאפ של Broker'});
  await act(async()=>{client.setQueryData(['broker-whatsapp-job','broker-id'],{job:{id:'job',status:'not_found',attempts:1,last_error:null}});});
  await waitFor(()=>expect(screen.getByRole('button',{name:'גילוי WhatsApp של Broker'})).toBeEnabled());
});
it('keeps the active job locked during a failed background poll and unlocks on a later terminal read',async()=>{
  const client=setup('running');
  await screen.findByRole('button',{name:'פרטי גילוי וואטסאפ של Broker'});
  const key=['broker-whatsapp-job','broker-id'];
  await act(async()=>{client.getQueryCache().find({queryKey:key})?.setState({status:'error',error:new TypeError('connection reset')});});
  expect(client.getQueryData<{job:{status:string}}>(key)?.job.status).toBe('running');
  expect(screen.queryByRole('button',{name:'גילוי WhatsApp של Broker'})).toBeNull();
  await act(async()=>{client.setQueryData(key,{job:{id:'job',status:'not_found',attempts:1,last_error:null}});});
  await waitFor(()=>expect(screen.getByRole('button',{name:'גילוי WhatsApp של Broker'})).toBeEnabled());
});