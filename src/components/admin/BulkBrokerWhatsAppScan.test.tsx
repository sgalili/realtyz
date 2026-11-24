import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,it,expect,vi } from 'vitest';
import { BulkBrokerWhatsAppScan } from './BulkBrokerWhatsAppScan';
const state=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/hooks/useSuperAdminGate',()=>({useSuperAdminGate:()=>({enabled:true,uid:'admin'})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'admin'}})}));
afterEach(()=>{cleanup();state.invoke.mockReset();});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BulkBrokerWhatsAppScan/></QueryClientProvider>);}
it('stores all selected IDs in one confirmed server request without browser paging',async()=>{
 state.invoke.mockImplementation((_fn,{body})=>Promise.resolve({data:body.action==='bulk_targets'?{brokers:[{user_id:'one',full_name:'First'},{user_id:'two',full_name:'Second'}]}:body.action==='start_selected_batch'?{batch:{id:'batch-1',status:'running'}}:{batch:null}}));mount();await waitFor(()=>expect(screen.getByRole('button')).toBeEnabled());fireEvent.click(screen.getByRole('button'));await screen.findByRole('checkbox',{name:'בחירת First'});
 expect(state.invoke.mock.calls.some(([,a])=>a.body.action==='start_selected_batch')).toBe(false);fireEvent.click(screen.getByRole('checkbox',{name:'בחירת Second'}));fireEvent.click(screen.getByRole('button',{name:'התחלת גילוי (1)'}));
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker',{body:{action:'start_selected_batch',broker_ids:['one'],confirmed:true}}));expect(state.invoke.mock.calls.some(([,a])=>a.body.action==='enqueue_missing')).toBe(false);
});
it('restores an active operation but cancels only after the stop confirmation',async()=>{
 state.invoke.mockResolvedValue({data:{batch:{id:'batch-1',status:'running'}}});mount();fireEvent.click(await screen.findByRole('button',{name:'עצירת איתור WhatsApp'}));expect(state.invoke.mock.calls.some(([,a])=>a.body.action==='cancel_batch')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'עצירת הגילוי'}));await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker',{body:{action:'cancel_batch',batch_id:'batch-1'}}));
});
it('never cancels a saved operation on navigation or unmount',async()=>{
 state.invoke.mockResolvedValue({data:{batch:{id:'batch-1',status:'running'}}});const m=mount();await screen.findByRole('button',{name:'עצירת איתור WhatsApp'});m.unmount();expect(state.invoke.mock.calls.every(([,a])=>a.body.action==='batch_status')).toBe(true);
});