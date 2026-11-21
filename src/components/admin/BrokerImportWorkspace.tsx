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
      {/* The page's scroll container keeps a 20px top padding and 15px side gutters, so the
          sticky tab band is pulled up into that padding and widened past the gutters: while
          scrolling, the white band hides the cards passing behind it instead of letting them
          peek above and beside the tabs. */}
      <div data-import-tabs className="sticky -top-[20px] z-20 -mx-[15px] bg-background px-[15px] pb-2 pt-[28px]">
        <TabsList className="grid w-full min-w-0 grid-cols-3">
          <TabsTrigger value="pending" className="px-1 text-base">ממתינים ({pendingCount ?? 0})</TabsTrigger>
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
