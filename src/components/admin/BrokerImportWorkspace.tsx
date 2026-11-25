import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from '@/lib/router-compat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminHistoryFromParams, saveSuperAdminViewState, type AdminHistoryTab } from '@/lib/superAdminViewState';
import { useAdminImportJobs } from '@/hooks/useAdminImportJobs';
import { BrokerBatchImportCard } from './BrokerBatchImportCard';
import { BrokerContactQueueCard, usePendingInvitations, useImportHistoryRows, useSendHistoryRows } from './BrokerContactQueueCard';
import { threadInvitationHistory } from '@/lib/invitationHistory';
import { emptyImportSearch } from '@/lib/adminImportPresentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function BrokerImportWorkspace() {
  const [params, setParams] = useSearchParams();
  const pendingCount = usePendingInvitations().data?.brokers.length;
  const imports = useImportHistoryRows();
  const sends = useSendHistoryRows();
  const importCount = imports.data?.items.filter(item => item.workspace_owner_id).length ?? 0;
  const sendCount = threadInvitationHistory(sends.data?.items ?? []).length;
  const importRunning = useAdminImportJobs().data?.[0]?.status === 'running';
  const [searchOpen, setSearchOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState(emptyImportSearch);
  useEffect(() => {
    const toggle = () => setSearchOpen(value => !value);
    window.addEventListener('admin-broker-import:search', toggle);
    return () => window.removeEventListener('admin-broker-import:search', toggle);
  }, []);
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
    {searchOpen && <div className="space-y-2 py-2">
      <div className="flex items-center gap-2"><Input autoFocus aria-label="חיפוש בייבוא ובשליחות" placeholder="שם, משרד, עיר, טלפון או רישיון" value={search.text} onChange={e => setSearch(s => ({ ...s, text: e.target.value }))} />
        <Button variant="ghost" size="icon" aria-label="חיפוש מתקדם" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}><SlidersHorizontal className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="סגירת החיפוש" onClick={() => { setSearchOpen(false);setSearch(emptyImportSearch); }}><X className="h-4 w-4" /></Button>
      </div>
      {advanced && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={search.kind} onValueChange={kind => setSearch(s => ({ ...s, kind }))}><SelectTrigger aria-label="סוג חשבון"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל סוגי החשבונות</SelectItem><SelectItem value="broker">מתווכים</SelectItem><SelectItem value="developer">יזמים</SelectItem><SelectItem value="marketing">חברות שיווק</SelectItem></SelectContent></Select>
        <Select value={search.channel} onValueChange={channel => setSearch(s => ({ ...s, channel }))}><SelectTrigger aria-label="ערוץ שליחה"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל ערוצי השליחה</SelectItem><SelectItem value="whatsapp">וואטסאפ</SelectItem><SelectItem value="email">מייל</SelectItem></SelectContent></Select>
        <Select value={search.whatsapp} onValueChange={whatsapp => setSearch(s => ({ ...s, whatsapp }))}><SelectTrigger aria-label="מספר וואטסאפ"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל מספרי הוואטסאפ</SelectItem><SelectItem value="saved">מספר שמור</SelectItem><SelectItem value="missing">מספר חסר</SelectItem></SelectContent></Select>
      </div>}
    </div>}
    <Tabs value={activeTab} onValueChange={selectTab} dir="rtl" className="min-w-0">
      {/* The page's scroll container keeps a 20px top padding and 15px side gutters, so the
          sticky tab band is pulled up into that padding and widened past the gutters: while
          scrolling, the white band hides the cards passing behind it instead of letting them
          peek above and beside the tabs. */}
      <div data-import-tabs className="bg-background py-2">
        <TabsList secondary className="grid w-full min-w-0 grid-cols-3">
          <TabsTrigger value="pending" className="px-1 text-base">ממתינים ({pendingCount ?? 0})</TabsTrigger>
          <TabsTrigger value="sends" className="px-1 text-base">נשלחו ({sendCount})</TabsTrigger>
          <TabsTrigger value="imports" className="gap-1.5 px-1 text-base">{importRunning && <span aria-label="ייבוא פעיל" className="h-2 w-2 shrink-0 rounded-full bg-success" />}ייבוא ({importCount})</TabsTrigger>
        </TabsList>
      </div>
      <BrokerBatchImportCard visible={activeTab === 'imports'} />
      <TabsContent value="pending" className="m-0"><BrokerContactQueueCard view="pending" search={search} /></TabsContent>
      <TabsContent value="imports" className="m-0"><BrokerContactQueueCard view="imports" search={search} /></TabsContent>
      <TabsContent value="sends" className="m-0"><BrokerContactQueueCard view="sends" search={search} /></TabsContent>
    </Tabs>
  </div>;
}
