import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FacebookGroupsIcon } from '@/components/icons/FacebookGroupsIcon';
import { getCloudSessionState } from '@/lib/cloudSession';
import { fetchGroupsViaCloud } from '@/lib/cloudGroupDiscovery';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * Cloud-only Facebook connection prompt shown before creating a post when the
 * workspace has no active cloud session. Opens the remote cloud browser,
 * waits for the session, then fetches groups in the cloud and returns to the
 * post editor. No browser extension is involved.
 */
export function FacebookCloudConnectGate() {
  const owner = useActiveWorkspaceOwnerId();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'syncing'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    setOpen(false);
    void getCloudSessionState().then((s) => { if (live && !s.active) setOpen(true); });
    return () => { live = false; if (timer.current) window.clearInterval(timer.current); };
  }, [owner]);

  const finish = async () => {
    if (timer.current) window.clearInterval(timer.current);
    setPhase('syncing');
    try {
      const groups = await fetchGroupsViaCloud('');
      toast.success(`פייסבוק מחובר · ${groups.length} קבוצות נטענו`);
    } catch (e) {
      toast.error((e as Error).message || 'טעינת הקבוצות נכשלה');
    }
    setPhase('idle');
    setOpen(false);
  };

  const connect = async () => {
    const win = window.open('about:blank', '_blank');
    setPhase('waiting');
    try {
      const { data, error } = await supabase.functions.invoke('fb-session-vault', { body: { action: 'remote_login' } });
      if (error || data?.error || !data?.url) throw new Error(data?.message || 'פתיחת החיבור בענן נכשלה');
      if (win) win.location.href = data.url; else window.open(data.url, '_blank');
      const deadline = Date.now() + 10 * 60_000;
      timer.current = window.setInterval(() => {
        if (Date.now() > deadline) { if (timer.current) window.clearInterval(timer.current); setPhase('idle'); return; }
        void getCloudSessionState().then((s) => { if (s.active) void finish(); });
      }, 5000);
    } catch (e) {
      win?.close();
      setPhase('idle');
      toast.error((e as Error).message);
    }
  };

  return <Dialog open={open} onOpenChange={(o) => { if (!o && phase !== 'syncing') setOpen(false); }}>
    <DialogContent dir="rtl" className="max-w-sm text-center">
      <DialogHeader className="items-center text-center">
        <FacebookGroupsIcon className="mb-2 h-14 w-14" />
        <DialogTitle className="text-xl">חברו את פייסבוק</DialogTitle>
        <DialogDescription>כדי לפרסם בעמוד ובקבוצות. הכל בענן, בלי תוסף.</DialogDescription>
      </DialogHeader>
      <Button size="lg" className="w-full" disabled={phase !== 'idle'} onClick={() => void connect()}>
        {phase !== 'idle' && <Loader2 className="h-4 w-4 animate-spin" />}
        {phase === 'waiting' ? 'ממתין להתחברות…' : phase === 'syncing' ? 'טוען קבוצות…' : 'חיבור פייסבוק'}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)} disabled={phase === 'syncing'}>אחר כך</Button>
    </DialogContent>
  </Dialog>;
}
