import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrokerOutreachPanel } from './BrokerOutreachPanel';
const state=vi.hoisted(()=>({status:'pending',cancelled:false,read:vi.fn(),cancel:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/brokerOutreach.functions',()=>({getBrokerOutreach:state.read,cancelBrokerOutreachCall:state.cancel,configureBrokerOutreach:vi.fn()}));
vi.mock('@/hooks/useSuperAdminGate',()=>({useSuperAdminGate:()=>({enabled:true,uid:'admin'})}));
vi.mock('@/hooks/useWorkspace',()=>({useWorkspace:()=>({setActiveWorkspace:vi.fn()})}));
vi.mock('@/lib/router-compat',()=>({useNavigate:()=>vi.fn()}));
vi.mock('./OfficialBrokerInvitationDialog',()=>({OfficialBrokerInvitationPanel:()=>null}));
beforeEach(()=>{
 state.status='pending';state.cancelled=false;
 state.read.mockImplementation(async()=>({journey:{enabled:true,message_consent_at:'saved',call_consent_at:'saved',consent_note:'consent',call_status:state.status,call_due_at:new Date(Date.now()+60_000).toISOString(),voice_status:'accepted'},profile:{full_name:'מתווך בדיקה',phone:'0500000000'},property:{address:'הרצל 10',city:'תל אביב'},events:[]}));
 state.cancel.mockImplementation(async()=>{if(state.cancelled)state.status='cancelled';return {cancelled:state.cancelled,pending:!state.cancelled};});
});
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BrokerOutreachPanel brokerId="00000000-0000-0000-0000-000000000010"/></QueryClientProvider>);}
describe('broker call takeover',()=>{
 it('does not offer a human call until provider cancellation is confirmed',async()=>{
  mount();fireEvent.click(await screen.findByRole('button',{name:'ביטול שיחת ריטה'}));
  await waitFor(()=>expect(state.cancel).toHaveBeenCalledOnce());
  expect(screen.queryByRole('link',{name:'חיוג אישי'})).not.toBeInTheDocument();
 });
 it('offers the human call only after confirmed cancellation reads back',async()=>{
  state.cancelled=true;mount();fireEvent.click(await screen.findByRole('button',{name:'ביטול שיחת ריטה'}));
  const link=await screen.findByRole('link',{name:'חיוג אישי'});
  expect(link).toHaveAttribute('href','tel:0500000000');
 });
});