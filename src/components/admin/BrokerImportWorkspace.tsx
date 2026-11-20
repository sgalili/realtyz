import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminHistoryFromParams, saveSuperAdminViewState, type AdminHistoryTab } from '@/lib/superAdminViewState';
import { BrokerBatchImportCard } from './BrokerBatchImportCard';
import { BrokerContactQueueCard, usePendingInvitations } from './BrokerContactQueueCard';

export function BrokerImportWorkspace() {
  const [params, setParams] = useSearchParams();
  const pendingCount = usePendingInvitations().data?.brokers.length;
  const activeTab = adminHistoryFromParams(params.get('history'));
  useEffect(() => saveSuperAdminViewState({ history: activeTab }), [activeTab]);

  const selectTab = (value: string) => {
    const history: AdminHistoryTab = value === 'imports' || value === 'sends' ? value : 'pending';
    saveSuperAdminViewState({ history });
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set('history', history);
      return next;
    }, { replace: true });
  };

  return <div dir="rtl" className="min-w-0">
    <BrokerBatchImportCard />
    <Tabs value={activeTab} onValueChange={selectTab} dir="rtl" className="min-w-0">
      <div data-import-tabs className="sticky top-0 z-20 bg-background py-2">
        <TabsList className="grid w-full min-w-0 grid-cols-3">
          <TabsTrigger value="pending" className="px-1 text-base">ממתינים להזמנה{pendingCount ? ` (${pendingCount})` : ''}</TabsTrigger>
          <TabsTrigger value="imports" className="px-1 text-base">היסטוריית ייבוא</TabsTrigger>
          <TabsTrigger value="sends" className="px-1 text-base">היסטוריית שליחות</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="pending" className="m-0"><BrokerContactQueueCard view="pending" /></TabsContent>
      <TabsContent value="imports" className="m-0"><BrokerContactQueueCard view="imports" /></TabsContent>
      <TabsContent value="sends" className="m-0"><BrokerContactQueueCard view="sends" /></TabsContent>
    </Tabs>
  </div>;
}
