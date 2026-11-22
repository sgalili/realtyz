import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerNumberEditor } from './BrokerNumberEditor';
const state=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
afterEach(()=>{cleanup();state.invoke.mockReset();});
function setup(kind:'phone'|'whatsapp') {
  state.invoke.mockResolvedValue({data:{ok:true},error:null});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BrokerNumberEditor brokerId="broker" name="Dana" kind={kind}/></QueryClientProvider>);
}
it('manual WhatsApp saves only the separate contact, never the primary phone',async()=>{
  setup('whatsapp');fireEvent.click(screen.getByRole('button',{name:'הוספת וואטסאפ של Dana'}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'0502222222'}});
  fireEvent.click(screen.getByRole('button',{name:'שמירה'}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('broker-whatsapp-worker',{body:{action:'save_contact',broker_id:'broker',phone:'0502222222'}}));
  expect(state.invoke.mock.calls.some(([fn])=>fn==='admin-broker-contact')).toBe(false);
});
it('automatic telephone detection suggests a value and waits for explicit save',async()=>{
  setup('phone');state.invoke.mockImplementation((_fn,{body})=>Promise.resolve({data:body.action==='enqueue'?{job:{id:'job',status:'pending'}}:{job:{id:'job',status:'not_found',discovered_phone:'972502222222'}},error:null}));
  fireEvent.click(screen.getByRole('button',{name:'הוספת טלפון של Dana'}));
  fireEvent.click(screen.getByRole('button',{name:'איתור אוטומטי'}));
  await waitFor(()=>expect(screen.getByRole('textbox')).toHaveValue('050-2222222'));
  expect(state.invoke.mock.calls.some(([fn])=>fn==='admin-broker-contact')).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'שמירה'}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('admin-broker-contact',{body:{action:'save',user_id:'broker',phone:'050-2222222'}}));
});