import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { WalletTopUp } from './WalletTopUp';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
afterEach(() => { cleanup(); invoke.mockReset(); });
function open() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WalletTopUp /></QueryClientProvider>); }
it('never creates payment for an unconfigured method despite valid preparation fields', async () => {
  invoke.mockResolvedValue({ data: { available: false, methods: [] }, error: null });
  open();
  await waitFor(() => expect(screen.getByRole('button', { name: 'ביט' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'ביט' }));
  fireEvent.change(screen.getByLabelText('סכום להפקדה (₪)'), { target: { value: '200.25' } });
  fireEvent.change(screen.getByLabelText('מה הטלפון הנייד שלך?'), { target: { value: '0501234567' } });
  expect(screen.getByRole('button', { name: 'תשלום מאובטח' })).toBeDisabled();
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('requires provider-declared customer identity before enabling card checkout', async () => {
  invoke.mockResolvedValue({ data: { available: true, methods: [{ id: 'card', fields: ['national_id'] }] }, error: null });
  open();
  await waitFor(() => expect(screen.getByRole('button', { name: 'כרטיס אשראי' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'כרטיס אשראי' }));
  fireEvent.change(screen.getByLabelText('סכום להפקדה (₪)'), { target: { value: '200.25' } });
  fireEvent.change(screen.getByLabelText('מה הטלפון הנייד שלך?'), { target: { value: '0501234567' } });
  expect(screen.getByRole('button', { name: 'תשלום מאובטח' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('תעודת זהות'), { target: { value: '123456789' } });
  expect(screen.getByRole('button', { name: 'תשלום מאובטח' })).toBeEnabled();
});
it('blocks an out-of-range custom package even with configured payment and valid mobile',async () => {
  invoke.mockResolvedValue({data:{available:true,methods:[{id:'bit',fields:[]}]},error:null});
  open();
  await waitFor(()=>expect(screen.getByRole('button',{name:'ביט'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'ביט'}));
  fireEvent.change(screen.getByLabelText('מה הטלפון הנייד שלך?'),{target:{value:'0501234567'}});
  for(const value of ['4.99','2500.01']) {
    fireEvent.change(screen.getByLabelText('סכום להפקדה (₪)'),{target:{value}});
    expect(screen.getByRole('button',{name:'תשלום מאובטח'})).toBeDisabled();
  }
  fireEvent.change(screen.getByLabelText('סכום להפקדה (₪)'),{target:{value:'2500'}});
  expect(screen.getByRole('button',{name:'תשלום מאובטח'})).toBeEnabled();
});