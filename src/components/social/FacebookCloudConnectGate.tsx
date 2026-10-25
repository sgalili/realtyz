import { useEffect, useRef, useState } from 'react';
import { Facebook, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getCloudSessionState } from '@/lib/cloudSession';
import { fetchGroupsViaCloud } from '@/lib/cloudGroupDiscovery';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * Clean two-step Facebook connection screen shown before creating a post when
 * the workspace has no active cloud session. Opens the remote cloud browser,
 * waits for the session, then fetches groups in the cloud and returns to the
 * publishing screen. A "connect later" link lets the user skip straight to
 * publishing. No browser extension is involved.
 */
export function FacebookCloudConnectGate({ alwaysVisible = false, onSynced, onDiscover }: { alwaysVisible?: boolean; onSynced?: () => void; onDiscover?: () => void }) {
  const owner = useActiveWorkspaceOwnerId();
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
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
    stop(); setOpen(false); setSkipped(false); setPhase('idle'); setConnected(false); setErrorMessage('');
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
      onSynced?.();
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

  if ((!open && !alwaysVisible) || skipped) return null;
  return <section dir="rtl" className="space-y-4 text-right" aria-label="חיבור לפייסבוק">
    <Button type="button" disabled={phase !== 'idle' || !owner} onClick={() => void connect()}
      className="h-12 w-full gap-2 bg-[#1877F2] text-base font-semibold text-white hover:bg-[#1877F2]/90">
      {phase !== 'idle' ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Facebook className="h-5 w-5 text-white" />}
      {phase === 'waiting' ? 'ממתינים להשלמת החיבור…' : phase === 'syncing' ? 'מייבאים את הקבוצות…' : connected ? 'ייבוא הקבוצות שלי' : 'חיבור באמצעות פייסבוק'}
    </Button>
    {phase === 'waiting' && <p role="status" className="text-sm leading-relaxed text-muted-foreground">השלימו את הכניסה לפייסבוק בחלון שנפתח.</p>}
    {connected && <p className="flex items-center gap-1 text-sm text-success"><ShieldCheck className="h-4 w-4" />החיבור שמור ומוצפן בענן</p>}
    {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
    <Button type="button" variant="link" className="w-full" disabled={phase !== 'idle'} onClick={() => setSkipped(true)}>אתחבר יותר מאוחר</Button>
  </section>;
}
