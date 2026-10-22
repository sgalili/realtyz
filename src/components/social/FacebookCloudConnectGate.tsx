import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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

  if (!open) return null;
  return <div dir="rtl" className="space-y-1">
    <button
      type="button"
      disabled={phase !== 'idle'}
      onClick={() => void connect()}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-md bg-[#1877F2] text-lg font-semibold text-white transition-colors hover:bg-[#166FE5] disabled:opacity-70"
    >
      {phase !== 'idle' ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" /></svg>
      )}
      חיבור לפייסבוק
    </button>
    {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
  </div>;
}
