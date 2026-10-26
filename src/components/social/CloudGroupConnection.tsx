import { useEffect, useState } from 'react';
import { RefreshCw, Settings2 } from 'lucide-react';
import { FacebookGroupsIcon } from '@/components/icons/FacebookGroupsIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FacebookCloudConnectGate } from './FacebookCloudConnectGate';
import { GroupDiscoveryDialog } from './GroupDiscoveryDialog';
import { Button } from '@/components/ui/button';
import { getCloudSessionState, type CloudSessionState } from '@/lib/cloudSession';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useGroupQueueLive } from '@/hooks/useGroupQueueLive';

export function CloudGroupConnection({ onRefresh }: { onRefresh: () => void }) {
  const owner = useActiveWorkspaceOwnerId();
  const [open, setOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [state, setState] = useState<CloudSessionState | null>(null);
  const refresh = async () => { setState(await getCloudSessionState()); onRefresh(); };
  useEffect(() => { let live = true; setState(null); void getCloudSessionState().then(s => { if (live) setState(s); }); return () => { live = false; }; }, [owner]);
  useGroupQueueLive(owner, () => { void getCloudSessionState().then(setState); });
  return <div className="flex min-w-0 items-center gap-1.5 text-sm">
    <FacebookGroupsIcon className="h-4 w-4" />
    <span className="truncate">{!state ? 'בודק חיבור פייסבוק…' : state.active && state.workerReady ? 'חיבור פייסבוק שמור' : state.active ? 'החיבור אינו זמין' : 'נדרש חיבור פייסבוק'}</span>
    <Button variant="ghost" size="icon" title="רענון מצב החיבור" aria-label="רענון מצב החיבור" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button>
    <Button variant="ghost" size="icon" title="חיבור לפייסבוק" aria-label="חיבור לפייסבוק" onClick={() => setOpen(true)}><Settings2 className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="sm:max-w-md"><DialogTitle className="sr-only">חיבור מהיר לפייסבוק</DialogTitle><DialogDescription className="sr-only">חיבור וסנכרון קבוצות בפייסבוק</DialogDescription><FacebookCloudConnectGate key={owner} alwaysVisible onSynced={() => void refresh()} onDiscover={() => { setOpen(false); setDiscoveryOpen(true); }} /></DialogContent></Dialog>
    <GroupDiscoveryDialog key={owner} open={discoveryOpen} onOpenChange={setDiscoveryOpen} onJoined={onRefresh} />
  </div>;
}