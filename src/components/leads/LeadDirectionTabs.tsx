import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownLeft, Send } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SentPartnerLeads from './SentPartnerLeads';
import { useIncomingLeadsCount } from '@/components/billing/SidebarWalletIndicator';
import { useMySubmissions } from '@/hooks/useAffiliate';

/** Direction is navigation state; membership and data access stay server-authorized. */
export default function LeadDirectionTabs({ children }: { children: ReactNode }) {
  const { isAffiliate, loading, error } = useUserRole();
  const location = useLocation();
  const navigate = useNavigate();
  const received = useIncomingLeadsCount();
  const { data: sentRows = [] } = useMySubmissions();
  if (loading || error || !isAffiliate) return <>{children}</>;
  const params = new URLSearchParams(location.search);
  const direction = params.get('direction') === 'sent' ? 'sent' : 'received';
  return <Tabs value={direction} dir="rtl" onValueChange={(value) => {
    const next = new URLSearchParams(location.search);
    if (value === 'sent') next.set('direction', 'sent');
    else next.delete('direction');
    navigate({ pathname: location.pathname, search: next.toString() });
  }}>
    <TabsList className="mb-3 grid w-full grid-cols-2">
      <TabsTrigger value="received" className="min-w-0 gap-2"><ArrowDownLeft className="h-4 w-4 shrink-0" /><span className="tabular-nums">{received}</span> לידים שקיבלתי</TabsTrigger>
      <TabsTrigger value="sent" className="min-w-0 gap-2"><Send className="h-4 w-4 shrink-0" /><span className="tabular-nums">{sentRows.length}</span> לידים שמכרתי</TabsTrigger>
    </TabsList>
    <TabsContent value="received">{children}</TabsContent>
    <TabsContent value="sent"><SentPartnerLeads /></TabsContent>
  </Tabs>;
}