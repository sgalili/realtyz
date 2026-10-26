import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Facebook, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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
export function FacebookCloudConnectGate({ alwaysVisible = false, onSynced, onDiscover, onStatusChange }: { alwaysVisible?: boolean; onSynced?: () => void; onDiscover?: () => void; onStatusChange?: (ready: boolean) => void }) {
  const owner = useActiveWorkspaceOwnerId();
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'syncing'>('idle');
  const timer = useRef<number | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [connected, setConnected] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const checking = useRef(false);
  const deadline = useRef(0);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    controller.current?.abort();
  };

  useEffect(() => {
    const run = ++generation.current;
    stop(); checking.current = false; setCheckingStatus(false); setGuidanceOpen(false); setOpen(false); setSkipped(false); setPhase('idle'); setConnected(false); setErrorMessage(''); setManualUrl('');
    if (owner) void getCloudSessionState().then(s => {
      if (generation.current === run) { setConnected(s.active); setOpen(!s.active); onStatusChange?.(s.active); }
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
      onStatusChange?.(true);
      setPhase('idle'); setOpen(false); setGuidanceOpen(false); setManualUrl('');
    } catch (e) {
      if (generation.current !== run || abort.signal.aborted) return;
      // Connection succeeded; group import can retry later, so continue to the wizard.
      toast.warning((e as Error).message || 'ייבוא הקבוצות יושלם מאוחר יותר');
      onStatusChange?.(true);
      setPhase('idle'); setOpen(false); setGuidanceOpen(false); setManualUrl('');
    }
  };

  const checkConnection = async (run: number, manual = false) => {
    if (generation.current !== run || checking.current) return;
    checking.current = true; setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('fb-session-vault', { body: { action: 'remote_check' } });
      if (generation.current !== run) return;
      if (error || data?.error) {
        setErrorMessage(data?.message || 'לא ניתן לבדוק את החיבור כרגע. נסו שוב.');
        return;
      }
      const state = await getCloudSessionState();
      if (generation.current !== run) return;
      if (state.active) { await finish(run); return; }
      if (manual) setErrorMessage('החיבור עדיין לא זוהה. השלימו את הכניסה לפייסבוק בדפדפן הענן וחזרו לבדיקה.');
    } catch {
      if (generation.current === run) setErrorMessage('בדיקת החיבור נכשלה. נסו שוב.');
    } finally {
      if (generation.current === run) { checking.current = false; setCheckingStatus(false); }
    }
  };

  useEffect(() => {
    const checkOnReturn = () => {
      if (phase === 'waiting' && document.visibilityState !== 'hidden') void checkConnection(generation.current);
    };
    window.addEventListener('focus', checkOnReturn);
    document.addEventListener('visibilitychange', checkOnReturn);
    return () => { window.removeEventListener('focus', checkOnReturn); document.removeEventListener('visibilitychange', checkOnReturn); };
  }, [phase, owner]);

  const connect = async () => {
    const run = generation.current;
    if (connected) { await finish(run); return; }
    // Placeholder opened synchronously on the click gesture so a new tab stays
    // allowed while the backend prepares the GoLogin cloud browser URL.
    let placeholder: Window | null = null;
    try { placeholder = window.open('about:blank', '_blank'); } catch { /* blocked */ }
    if (placeholder) placeholder.opener = null;
    setPhase('waiting'); setErrorMessage(''); setManualUrl('');
    let cloudUrl = '';
    try {
      const { data, error } = await supabase.functions.invoke('fb-session-vault', { body: { action: 'remote_login' } });
      const payload = data ?? await (error as { context?: Response } | null)?.context?.json().catch(() => null);
      if (error || payload?.error || !payload?.url) throw new Error(payload?.message || 'פתיחת החיבור בענן נכשלה');
      if (generation.current !== run) { placeholder?.close(); return; }
      cloudUrl = payload.url;
    } catch (e) {
      placeholder?.close();
      if (generation.current !== run) return;
      stop(); setPhase('idle'); setErrorMessage((e as Error).message);
      return;
    }
    setManualUrl(cloudUrl);
    // Open the GoLogin cloud browser URL directly in a new tab; never navigate
    // the current frame. If the direct open is blocked, reuse the placeholder
    // tab, and as a last resort offer a manual link the user can click.
    let tab: Window | null = null;
    try { tab = window.open(cloudUrl, '_blank'); } catch { tab = null; }
    if (tab) { try { tab.opener = null; } catch { /* cross-origin */ } }
    if (tab && tab !== placeholder) placeholder?.close();
    if (!tab) {
      try {
        if (placeholder && !placeholder.closed) { placeholder.location.href = cloudUrl; tab = placeholder; }
      } catch { tab = null; }
    }
    if (!tab) {
      placeholder?.close();
      setManualUrl(cloudUrl);
      toast.warning('הדפדפן חסם פתיחת חלון חדש. לחצו "פתיחת דפדפן הענן" כדי להמשיך.');
    }
    deadline.current = Date.now() + 10 * 60_000;
    timer.current = window.setInterval(() => {
      if (generation.current !== run) return;
      if (Date.now() > deadline.current) { stop(); setPhase('idle'); setErrorMessage('החיבור לא הושלם בזמן. אפשר לבדוק שוב או לפתוח חיבור חדש.'); return; }
      void checkConnection(run);
    }, 5000);
  };

  if ((!open && !alwaysVisible) || skipped) return null;
  return <section dir="rtl" className="space-y-4 text-right" aria-label="חיבור לפייסבוק">
    <Button type="button" disabled={phase === 'syncing' || !owner} onClick={() => { if (connected) void finish(generation.current); else setGuidanceOpen(true); }}
      className="h-12 w-full gap-2 bg-social-facebook text-base font-semibold text-social-foreground hover:bg-social-facebook/90">
      {phase !== 'idle' ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Facebook className="h-5 w-5" />}
      {phase === 'waiting' ? 'ממתינים להשלמת החיבור…' : phase === 'syncing' ? 'מייבאים את הקבוצות…' : connected ? 'ייבוא הקבוצות שלי' : 'חיבור באמצעות פייסבוק'}
    </Button>
    {phase === 'waiting' && <p role="status" className="text-sm leading-relaxed text-muted-foreground">השלימו את הכניסה לפייסבוק בחלון שנפתח.</p>}
    {connected && <p className="flex items-center gap-1 text-sm text-success"><ShieldCheck className="h-4 w-4" />החיבור שמור ומוצפן בענן</p>}
    {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
    <Button type="button" variant="link" className="w-full" disabled={phase === 'syncing'} onClick={() => { generation.current++; stop(); setGuidanceOpen(false); setManualUrl(''); setSkipped(true); onStatusChange?.(true); }}>אתחבר יותר מאוחר</Button>
    <Dialog open={guidanceOpen} onOpenChange={setGuidanceOpen}>
      <DialogContent dir="rtl" className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg text-right">
        <ShieldCheck className="mx-auto h-9 w-9 text-social-facebook" />
        <DialogTitle className="text-center text-xl">חיבור מאובטח לפייסבוק</DialogTitle>
        <DialogDescription className="text-base leading-relaxed">החיבור מתבצע בסביבת ענן מאובטחת ומבודדת. פרטי ההתחברות שלך אינם נשמרים במערכת TORAFF.</DialogDescription>
        <p className="text-sm leading-relaxed text-muted-foreground">סיסמת פייסבוק מוזנת רק באתר פייסבוק בדפדפן הענן. לצורך הפעילות שאישרתם, TORAFF שומרת חיבור מוצפן לסביבת העבודה, שניתן למחוק בהגדרות החיבורים.</p>
        <ol className="list-inside list-decimal space-y-2 text-base leading-relaxed">
          <li>פתחו את דפדפן הענן בלשונית חדשה.</li>
          <li>היכנסו לפייסבוק רק באתר facebook.com והשלימו כל אימות שפייסבוק מבקשת.</li>
          <li>חזרו ללשונית TORAFF. נבדוק את החיבור אוטומטית; אפשר גם ללחוץ על בדיקת החיבור.</li>
        </ol>
        {phase !== 'idle' && <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />{phase === 'syncing' ? 'מייבאים את הקבוצות…' : 'ממתינים לאישור החיבור מפייסבוק…'}</p>}
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Button className="h-auto min-h-12 gap-2 whitespace-normal bg-social-facebook text-base text-social-foreground hover:bg-social-facebook/90" disabled={phase !== 'idle'} onClick={() => void connect()}><ExternalLink className="h-5 w-5 shrink-0" />{manualUrl ? 'פתיחת חיבור חדש בענן' : 'פתיחת דפדפן הענן בלשונית חדשה'}</Button>
        {manualUrl && <>
          <a href={manualUrl} target="_blank" rel="noopener noreferrer" className="text-center text-base font-semibold text-primary underline underline-offset-4">פתיחת דפדפן הענן</a>
          <Button variant="outline" disabled={checkingStatus || phase === 'syncing'} onClick={() => void checkConnection(generation.current, true)}><RefreshCw className={`me-2 h-4 w-4 ${checkingStatus ? 'animate-spin motion-reduce:animate-none' : ''}`} />בדיקת החיבור</Button>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
