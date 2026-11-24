import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkBrokerRegistryRecheck } from './BulkBrokerRegistryRecheck';
const state=vi.hoisted(()=>({enabled:true,uid:'admin',invoke:vi.fn()}));
vi.mock('@/hooks/useSuperAdminGate',()=>({useSuperAdminGate:()=>({enabled:state.enabled,uid:state.uid})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
afterEach(()=>{cleanup();state.enabled=true;state.uid='admin';state.invoke.mockReset();});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BulkBrokerRegistryRecheck onProgress={vi.fn()}/></QueryClientProvider>);}
it('requires start confirmation and delegates the full red waiting list to the server, never the browser loop',async()=>{
 state.invoke.mockResolvedValue({data:{batch:null}});mount();await waitFor(()=>expect(screen.getByRole('button')).toBeEnabled());fireEvent.click(screen.getByRole('button'));
 expect(state.invoke.mock.calls.every(([,a])=>a.body.action==='status')).toBe(true);fireEvent.click(screen.getByRole('button',{name:'התחלת האימות'}));
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('admin-broker-registry-batch',{body:{action:'start',confirmed:true}}));expect(state.invoke.mock.calls.some(([name])=>name==='admin-broker-registry-name')).toBe(false);
});
it('restores a running batch on remount and requires confirmation before cancellation',async()=>{
 state.invoke.mockResolvedValue({data:{batch:{id:'batch',status:'running',done:3,total:10}}});const m=mount();const stop=await screen.findByRole('button',{name:'עצירת אימות מול המאגר הלאומי'});fireEvent.click(stop);
 expect(state.invoke.mock.calls.some(([,a])=>a.body.action==='cancel')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'ביטול'}));m.unmount();mount();fireEvent.click(await screen.findByRole('button',{name:'עצירת אימות מול המאגר הלאומי'}));fireEvent.click(screen.getByRole('button',{name:'עצירת האימות'}));
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('admin-broker-registry-batch',{body:{action:'cancel',batch_id:'batch',confirmed:true}}));
});
it('does not cancel a running job when the screen unmounts',async()=>{
 state.invoke.mockResolvedValue({data:{batch:{id:'batch',status:'running',done:0,total:10}}});const m=mount();await screen.findByRole('button',{name:'עצירת אימות מול המאגר הלאומי'});m.unmount();expect(state.invoke.mock.calls.every(([,a])=>a.body.action==='status')).toBe(true);
});
it('hides the action and does not fetch protected progress without a confirmed admin role',()=>{state.enabled=false;mount();expect(screen.queryByRole('button')).toBeNull();expect(state.invoke).not.toHaveBeenCalled();});