import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BulkBrokerRegistryRecheck } from './BulkBrokerRegistryRecheck';
const state=vi.hoisted(()=>({enabled:true,uid:'admin',invoke:vi.fn()}));
vi.mock('@/hooks/useSuperAdminGate',()=>({useSuperAdminGate:()=>({enabled:state.enabled,uid:state.uid})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
afterEach(()=>{cleanup();state.enabled=true;state.uid='admin';state.invoke.mockReset();});
function mount(onProgress=vi.fn()) { const client=new QueryClient({defaultOptions:{queries:{retry:false}}}); const node=<QueryClientProvider client={client}><TooltipProvider><BulkBrokerRegistryRecheck onProgress={onProgress}/></TooltipProvider></QueryClientProvider>;return{client,onProgress,...render(node),node}; }
it('automatically checks only red waiting records and applies only exact saved responses',async()=>{
 const rows=[{user_id:'red',license_number:'123',license_verified:false},{user_id:'green',license_number:'456',license_verified:true},{user_id:'dev',license_number:'789',is_developer:true}];
 state.invoke.mockImplementation((fn)=>Promise.resolve(fn==='admin-broker-contact'?{data:{brokers:rows}}:{data:{profile:{id:'red',broker_license_number:'123',full_name:'שם מהמאגר'}}}));
 const m=mount();m.client.setQueryData(['broker-contact-queue','admin'],{brokers:rows});
 fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(m.onProgress).toHaveBeenLastCalledWith(expect.stringContaining('הבדיקה הושלמה')));
 expect(state.invoke).toHaveBeenCalledWith('admin-broker-registry-name',{body:{user_id:'red',license_number:'123'}});
 expect(state.invoke).toHaveBeenCalledTimes(2);
 expect(m.client.getQueryData<{brokers:any[]}>(['broker-contact-queue','admin'])?.brokers[0]).toMatchObject({license_verified:true,full_name:'שם מהמאגר'});
});
it('rejects unrelated registry responses without turning the target green',async()=>{
 const rows=[{user_id:'red',license_number:'123',license_verified:false}];state.invoke.mockResolvedValueOnce({data:{brokers:rows}}).mockResolvedValueOnce({data:{profile:{id:'someone-else',broker_license_number:'123'}}});
 const m=mount();m.client.setQueryData(['broker-contact-queue','admin'],{brokers:rows});fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(m.onProgress).toHaveBeenLastCalledWith(expect.stringContaining('לא אומתו 1')));
 expect(m.client.getQueryData<{brokers:any[]}>(['broker-contact-queue','admin'])?.brokers[0].license_verified).toBe(false);
});
it('hides the batch action from an unconfirmed or non-admin user',()=>{state.enabled=false;mount();expect(screen.queryByRole('button')).toBeNull();expect(state.invoke).not.toHaveBeenCalled();});
it('discards a waiting-list response after an account switch',async()=>{let finish:(v:unknown)=>void=()=>{};state.invoke.mockImplementation(()=>new Promise(r=>{finish=r;}));const m=mount();fireEvent.click(screen.getByRole('button'));state.uid='other-admin';m.rerender(<QueryClientProvider client={m.client}><TooltipProvider><BulkBrokerRegistryRecheck onProgress={m.onProgress}/></TooltipProvider></QueryClientProvider>);finish({data:{brokers:[{user_id:'red',license_number:'123'}]}});await waitFor(()=>expect(screen.getByRole('button')).toBeEnabled());expect(state.invoke).toHaveBeenCalledTimes(1);});