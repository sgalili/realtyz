import { useEffect, useRef, useState } from 'react';
import { Cloud, Loader2, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
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
export function FacebookCloudConnectGate({ alwaysVisible = false, onSynced, onDiscover }: { alwaysVisible?: boolean; onSynced?: () => void; onDiscover?: () => void }) {
  const navigate = useNavigate();
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

  if (!open && !alwaysVisible) return null;
  return <section dir="rtl" className="space-y-4 text-right" aria-label="חיבור מהיר לפייסבוק">
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><Cloud className="h-5 w-5 text-primary" />חיבור מהיר לפייסבוק</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">מתחברים לפייסבוק, מסנכרנים את הקבוצות שלכם בענן ומפרסמים לקבוצות שבחרתם — עם מעקב אחר הפרסום והביצועים במקום אחד.</p>
    </div>
    <Button type="button" disabled={phase !== 'idle' || !owner} onClick={() => void connect()} className="h-12 w-full gap-2 text-base font-semibold">
      {phase !== 'idle' ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Cloud className="h-5 w-5" />}
      {phase === 'waiting' ? 'ממתינים להשלמת החיבור…' : phase === 'syncing' ? 'מייבאים את הקבוצות…' : connected ? 'ייבוא הקבוצות שלי' : 'חיבור באמצעות פייסבוק'}
    </Button>
    <p role="status" className="text-sm leading-relaxed text-muted-foreground">
      {phase === 'waiting' ? 'השלימו את הכניסה לפייסבוק בחלון שנפתח. הקבוצות יסונכרנו לאחר אישור החיבור.' : phase === 'syncing' ? 'הסנכרון מתבצע בענן. רק קבוצות עם חברות מאושרת זמינות לפרסום.' : connected ? 'החיבור לפייסבוק שמור. אפשר לייבא את הקבוצות שלכם או למצוא קבוצות נוספות בחיפוש.' : 'לאחר הכניסה נייבא את הקבוצות שלכם. רוצים להרחיב את החשיפה? חפשו והוסיפו קבוצות רלוונטיות בחיפוש המובנה.'}
    </p>
    {connected && <p className="flex items-center gap-1 text-sm text-success"><ShieldCheck className="h-4 w-4" />החיבור שמור ומוצפן בענן</p>}
    <Button type="button" variant="outline" className="w-full gap-2" disabled={phase !== 'idle'} onClick={() => onDiscover ? onDiscover() : navigate('/api-settings#facebook')}><Search className="h-4 w-4" />חיפוש והוספת קבוצות</Button>
    {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
  </section>;
}
