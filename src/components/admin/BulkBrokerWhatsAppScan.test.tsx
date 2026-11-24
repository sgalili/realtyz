import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,it,expect,vi } from 'vitest';
import { BulkBrokerWhatsAppScan } from './BulkBrokerWhatsAppScan';
const state=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/hooks/useSuperAdminGate', () => ({ useSuperAdminGate: () => ({ enabled: true, uid: 'admin' }) }));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'admin'}})}));
afterEach(()=>{cleanup();state.invoke.mockReset();});
it('requires confirmation and sends only checked broker IDs through the authorized batch',async()=>{
 state.invoke.mockImplementation((_fn,{body})=>Promise.resolve({data:body.action==='bulk_targets'?{brokers:[{user_id:'one',full_name:'First'},{user_id:'two',full_name:'Second'}]}:body.action==='start_batch'?{batch:{id:'batch-1',status:'running'}}:body.action==='enqueue_missing'?(body.after?{results:[{status:'already_set'},{status:'skipped'}],next:null}:{results:[{status:'queued'}],next:'next-id'}):{batch:null},error:null}));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BulkBrokerWhatsAppScan/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByRole('button')).toBeEnabled());
 fireEvent.click(screen.getByRole('button'));
 await screen.findByRole('checkbox',{name:'בחירת First'});
 expect(state.invoke.mock.calls.some(([,args])=>args.body.action==='start_batch')).toBe(false);
 fireEvent.click(screen.getByRole('checkbox',{name:'בחירת Second'}));
 fireEvent.click(screen.getByRole('button',{name:'התחלת גילוי (1)'}));
 await waitFor(()=>expect(state.invoke.mock.calls.filter(([,args])=>args.body.action==='enqueue_missing')).toHaveLength(2));
 expect(state.invoke.mock.calls.filter(([,args])=>args.body.action==='enqueue_missing')).toEqual([
  ['broker-whatsapp-worker',{body:{action:'enqueue_missing',batch_id:'batch-1',broker_ids:['one']}}],
  ['broker-whatsapp-worker',{body:{action:'enqueue_missing',batch_id:'batch-1',broker_ids:['one'],after:'next-id'}}]
 ]);
});
it('restores an active operation and cancels it instead of starting another scan',async()=>{
 state.invoke.mockImplementation((_fn,{body})=>Promise.resolve({data:body.action==='batch_status'?{batch:{id:'batch-1',status:'running'}}:{ok:true},error:null}));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BulkBrokerWhatsAppScan/></QueryClientProvider>);
 const stop=await screen.findByRole('button',{name:'עצירת איתור WhatsApp'});
 fireEvent.click(stop);
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker',{body:{action:'cancel_batch',batch_id:'batch-1'}}));
 expect(state.invoke.mock.calls.some(([,args])=>['start_batch','enqueue_missing'].includes(args.body.action))).toBe(false);
});
it('allows stop during enqueue and ignores a late page response without adding the next page',async()=>{
 let resolvePage:(value:unknown)=>void=()=>{};
 const page=new Promise(resolve=>{resolvePage=resolve;});
 state.invoke.mockImplementation((_fn,{body})=>body.action==='enqueue_missing'?page:Promise.resolve({data:body.action==='bulk_targets'?{brokers:[{user_id:'one',full_name:'First'},{user_id:'two',full_name:'Second'}]}:body.action==='start_batch'?{batch:{id:'batch-1',status:'running'}}:{batch:null},error:null}));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BulkBrokerWhatsAppScan/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByRole('button')).toBeEnabled());fireEvent.click(screen.getByRole('button'));
 await screen.findByRole('checkbox',{name:'בחירת First'});fireEvent.click(screen.getByRole('button',{name:'התחלת גילוי (2)'}));
 await waitFor(()=>expect(state.invoke.mock.calls.some(([,args])=>args.body.action==='enqueue_missing')).toBe(true));
 fireEvent.click(screen.getByRole('button',{name:'עצירת איתור WhatsApp'}));
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker',{body:{action:'cancel_batch',batch_id:'batch-1'}}));
 await act(async()=>resolvePage({data:{results:[{status:'queued'}],next:'late-next-id'},error:null}));
 expect(state.invoke.mock.calls.filter(([,args])=>args.body.action==='enqueue_missing')).toHaveLength(1);
});