import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerScannerPanel } from './BrokerScannerPanel';
vi.mock('@/hooks/useSuperAdminGate',()=>({useSuperAdminGate:()=>({enabled:true,uid:'admin'})}));
vi.mock('./BulkBrokerWhatsAppScan',()=>({BulkBrokerWhatsAppScan:()=>null}));
vi.mock('./BulkBrokerRegistryRecheck',()=>({BulkBrokerRegistryRecheck:()=>null}));
vi.mock('./BrokerGenderSort',()=>({BrokerGenderSort:()=>null}));
vi.mock('@/hooks/useAdminImportJobs',()=>({useAdminImportJobs:()=>({data:[]})}));
vi.mock('@/lib/router-compat',()=>({useNavigate:()=>vi.fn()}));
const api=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:api.invoke}}}));
afterEach(()=>{cleanup();api.invoke.mockReset();});
it('preserves last known quota and available controls after a background status error',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
  const key=['broker-wa-scanner','admin'];
  const data={settings:{enabled:true,paused:false,daily_cap:15,connected:true,webhook_ready:true},credentials_ready:true,used_today:3};
  client.setQueryData(key,data);
  client.setQueryData(['broker-whatsapp-batch','admin'],{batch:null});client.setQueryData(['broker-contact-queue','admin'],{brokers:[]});
  render(<QueryClientProvider client={client}><BrokerScannerPanel/></QueryClientProvider>);
  await act(async()=>{client.getQueryCache().find({queryKey:key})?.setState({status:'error',error:new TypeError('connection reset')});});
  expect(client.getQueryData(key)).toEqual(data);
  expect(screen.getByRole('button',{name:'עצירת הסריקה'})).toBeEnabled();
  expect(screen.getByTitle('וואטסאפ שהושלמו מתוך התור. לחיצה לפרטים')).toHaveTextContent('0/0');
});
it.each([['pause',false,'עצירת הסריקה','השהיית הסריקה'],['resume',true,'הפעלת הסריקה','הפעלת הסריקה']] as const)('requires confirmation before %s and never changes the line on Cancel',async(action,paused,label,confirmLabel)=>{
 const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});client.setQueryData(['broker-wa-scanner','admin'],{settings:{enabled:true,paused,daily_cap:15,connected:true,webhook_ready:true},credentials_ready:true,used_today:3});client.setQueryData(['broker-whatsapp-batch','admin'],{batch:null});client.setQueryData(['broker-contact-queue','admin'],{brokers:[]});api.invoke.mockResolvedValue({data:{ok:true}});
 render(<QueryClientProvider client={client}><BrokerScannerPanel/></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:label}));expect(api.invoke).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'ביטול'}));expect(api.invoke).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:label}));fireEvent.click(screen.getByRole('button',{name:confirmLabel}));await waitFor(()=>expect(api.invoke).toHaveBeenCalledWith('broker-whatsapp-scanner',{body:{action}}));
});