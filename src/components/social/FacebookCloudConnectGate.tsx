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
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    controller.current?.abort();
  };

  useEffect(() => {
    const run = ++generation.current;
    stop(); setOpen(false); setPhase('idle'); setConnected(false); setErrorMessage('');
    if (owner) void getCloudSessionState().then(s => {
      if (generation.current === run) { setConnected(s.active); setOpen(!s.active); }
    });
    return () => { generation.current++; stop(); };
  }, [owner]);

  const finish = async (run: number) => {
    if (generation.current !== run) return;
    stop(); setPhase('syncing'); setConnected(true); setErrorMessage('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const groups = await fetchGroupsViaCloud('', { syncMemberships: true, signal: abort.signal });
      if (generation.current !== run) return;
      toast.success(`פייסבוק מחובר · ${groups.length} קבוצות נסרקו`);
      setPhase('idle'); setOpen(false);
    } catch (e) {
      if (generation.current !== run || abort.signal.aborted) return;
      setErrorMessage((e as Error).message || 'סנכרון הקבוצות נכשל'); setPhase('idle');
    }
  };

  const connect = async () => {
    const run = generation.current;
    if (connected) { await finish(run); return; }
    const win = window.open('about:blank', '_blank');
    if (!win) { setErrorMessage('אפשרו פתיחת חלון חדש ונסו שוב.'); return; }
    win.opener = null;
    setPhase('waiting'); setErrorMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('fb-session-vault', { body: { action: 'remote_login' } });
      const payload = data ?? await (error as { context?: Response } | null)?.context?.json().catch(() => null);
      if (error || payload?.error || !payload?.url) throw new Error(payload?.message || 'פתיחת החיבור בענן נכשלה');
      if (generation.current !== run) { win.close(); return; }
      win.location.href = payload.url;
      const deadline = Date.now() + 10 * 60_000;
      let checking = false;
      timer.current = window.setInterval(() => {
        if (generation.current !== run) return;
        if (Date.now() > deadline) { stop(); setPhase('idle'); setErrorMessage('החיבור לא הושלם בזמן. נסו שוב.'); return; }
        if (checking) return;
        checking = true;
        void getCloudSessionState().then(s => {
          if (generation.current === run && s.active) void finish(run);
        }).finally(() => { checking = false; });
      }, 5000);
    } catch (e) {
      win.close();
      if (generation.current !== run) return;
      stop(); setPhase('idle'); setErrorMessage((e as Error).message);
    }
  };

  return <Dialog open={open} onOpenChange={(o) => { if (!o && phase !== 'syncing') { generation.current++; stop(); setPhase('idle'); setOpen(false); } }}>
    <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-sm text-center">
      <DialogHeader className="items-center text-center">
        <FacebookGroupsIcon className="mb-2 h-14 w-14" />
        <DialogTitle className="text-xl">חברו את פייסבוק</DialogTitle>
        <DialogDescription>כדי לפרסם בעמוד ובקבוצות. הכל בענן, בלי תוסף.</DialogDescription>
      </DialogHeader>
      <Button size="lg" className="w-full" disabled={phase !== 'idle'} onClick={() => void connect()}>
        {phase !== 'idle' && <Loader2 className="h-4 w-4 animate-spin" />}
        {phase === 'waiting' ? 'ממתין להתחברות…' : phase === 'syncing' ? 'טוען קבוצות…' : connected ? 'ניסיון נוסף לסנכרון' : 'חיבור פייסבוק'}
      </Button>
      {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
      <Button variant="ghost" onClick={() => { generation.current++; stop(); setPhase('idle'); setOpen(false); }} disabled={phase === 'syncing'}>אחר כך</Button>
    </DialogContent>
  </Dialog>;
}
