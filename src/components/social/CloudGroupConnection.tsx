import { useEffect, useState } from 'react';
import { Cloud, RefreshCw, Settings2 } from 'lucide-react';
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
    <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" />
    <span className="truncate">{!state ? 'בודק ענן…' : state.active && state.workerReady ? 'חיבור שמור בענן' : state.active ? 'הענן אינו זמין' : 'נדרש חיבור בענן'}</span>
    <Button variant="ghost" size="icon" title="רענון מצב הענן" aria-label="רענון מצב הענן" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button>
    <Button variant="ghost" size="icon" title="חיבור פייסבוק בענן" aria-label="חיבור פייסבוק בענן" onClick={() => setOpen(true)}><Settings2 className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="sm:max-w-md"><DialogTitle className="sr-only">חיבור מהיר לפייסבוק</DialogTitle><DialogDescription className="sr-only">חיבור וסנכרון קבוצות בענן</DialogDescription><FacebookCloudConnectGate key={owner} alwaysVisible onSynced={() => void refresh()} onDiscover={() => { setOpen(false); setDiscoveryOpen(true); }} /></DialogContent></Dialog>
    <GroupDiscoveryDialog key={owner} open={discoveryOpen} onOpenChange={setDiscoveryOpen} onJoined={onRefresh} />
  </div>;
}