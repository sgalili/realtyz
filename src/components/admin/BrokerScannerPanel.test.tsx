import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerScannerPanel } from './BrokerScannerPanel';
vi.mock('@/hooks/useSuperAdminGate',()=>({useSuperAdminGate:()=>({enabled:true,uid:'admin'})}));
vi.mock('./BulkBrokerWhatsAppScan',()=>({BulkBrokerWhatsAppScan:()=>null}));
vi.mock('./BulkBrokerRegistryRecheck',()=>({BulkBrokerRegistryRecheck:()=>null}));
afterEach(cleanup);
it('preserves last known quota and available controls after a background status error',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
  const key=['broker-wa-scanner','admin'];
  const data={settings:{enabled:true,paused:false,daily_cap:15,connected:true,webhook_ready:true},credentials_ready:true,used_today:3};
  client.setQueryData(key,data);
  render(<QueryClientProvider client={client}><BrokerScannerPanel/></QueryClientProvider>);
  await act(async()=>{client.getQueryCache().find({queryKey:key})?.setState({status:'error',error:new TypeError('connection reset')});});
  expect(client.getQueryData(key)).toEqual(data);
  expect(screen.getByRole('button',{name:'מחובר וסורק · לחיצה להשהיה'})).toBeEnabled();
  expect(screen.getByTitle('פניות היום')).toHaveTextContent('3/15');
});