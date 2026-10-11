import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const received = useIncomingLeadsCount('workspace');
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
    <TabsList className="mb-1.5 grid h-[44px] w-full grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
      <TabsTrigger value="received" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[17px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">לידים שקיבלתי ({received})</TabsTrigger>
      <TabsTrigger value="sent" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[17px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">לידים שמכרתי ({sentRows.length})</TabsTrigger>
    </TabsList>
    <TabsContent value="received" className="mt-1">{children}</TabsContent>
    <TabsContent value="sent" className="mt-1"><SentPartnerLeads /></TabsContent>
  </Tabs>;
}