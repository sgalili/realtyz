import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,it,expect,vi } from 'vitest';
import { BulkBrokerWhatsAppScan } from './BulkBrokerWhatsAppScan';
const state=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
afterEach(()=>{cleanup();state.invoke.mockReset();});
it('continues server-scoped batches without accepting client-supplied broker IDs or messaging',async()=>{
 state.invoke.mockResolvedValueOnce({data:{results:[{status:'queued'}],next:'next-id'},error:null}).mockResolvedValueOnce({data:{results:[{status:'already_set'},{status:'skipped'}],next:null},error:null});
 render(<QueryClientProvider client={new QueryClient()}><BulkBrokerWhatsAppScan/></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledTimes(2));
 expect(state.invoke.mock.calls[0]).toEqual(['broker-whatsapp-worker',{body:{action:'enqueue_missing'}}]);
 expect(state.invoke.mock.calls[1]).toEqual(['broker-whatsapp-worker',{body:{action:'enqueue_missing',after:'next-id'}}]);
});