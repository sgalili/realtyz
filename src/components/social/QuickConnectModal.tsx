import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { BrandLogo } from './BrandLogo';
import { CheckCircle2, Loader2, Lock, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import {
  SocialAutomationService,
  CONNECTION_STATES,
  type ConnectionState,
  type QuickConnectSession,
  type ConnectedAccount,
} from '@/lib/socialAutomationService';

interface QuickConnectModalProps {
  open: boolean;
  platform: string;
  displayName: string;
  /** When false, captureAccount must NOT fabricate identity labels. */
  demoMode?: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

export function QuickConnectModal({ open, platform, displayName, demoMode = false, onOpenChange, onConnected }: QuickConnectModalProps) {
  const [state, setState] = useState<ConnectionState>('IDLE');
  const [session, setSession] = useState<QuickConnectSession | null>(null);
  const [otp, setOtp] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  // Boot the state machine when modal opens.
  useEffect(() => {
    if (!open) return;
    setState('IDLE');
    setSession(null);
    setOtp('');
    setErrorMsg(null);
    setAccount(null);

    let cancelled = false;
    (async () => {
      setState('INITIALIZING');
      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return;
      const s = await SocialAutomationService.beginSession(platform);
      if (cancelled) return;
      setSession(s);
      if (s.method === 'oauth') {
        // Headless OAuth - skip directly through awaiting → syncing.
        runSyncingAndComplete(s);
      } else {
        setState('AWAITING_AUTH');
      }
    })();

    return () => {
      cancelled = true;
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platform]);

  const runSyncingAndComplete = (s: QuickConnectSession) => {
    clearTimers();
    setState('SYNCING');
    const captured = SocialAutomationService.captureAccount(platform, s.sessionId, { demoMode });
    setAccount(captured);

    const t1 = window.setTimeout(async () => {
      try {
        await SocialAutomationService.persistSession({
          platform,
          displayName,
          method: s.method,
          account: captured,
        });
        setState('CONNECTED');
        // Notify parent so connection list refreshes, but keep the modal
        // open — the user closes it manually.
        onConnected();
      } catch (e: any) {
        setErrorMsg(e?.message ?? 'שגיאה בשמירת הסשן');
        setState('FAILED');
      }
    }, 1600);
    timersRef.current.push(t1);
  };

  const handleQrConfirm = () => {
    if (!session) return;
    runSyncingAndComplete(session);
  };

  const handleOtpSubmit = async () => {
    if (!session) return;
    const ok = await SocialAutomationService.submitOtp(session.sessionId, otp);
    if (!ok) {
      setErrorMsg('הקוד שהוזן שגוי. נסה שוב.');
      return;
    }
    setErrorMsg(null);
    runSyncingAndComplete(session);
  };

  const qrSquares = useMemo(() => {
    const seed = session?.sessionId ?? 'init';
    const cells: boolean[] = [];
    for (let i = 0; i < 21 * 21; i++) {
      const ch = seed.charCodeAt(i % seed.length);
      cells.push(((ch + i * 7) % 5) < 2);
    }
    return cells;
  }, [session?.sessionId]);

  const desc = CONNECTION_STATES[state];
  const isProgressState = state === 'INITIALIZING' || state === 'SYNCING';
  const showPortal = state === 'AWAITING_AUTH';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearTimers(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background"
        dir="rtl"
      >
        {/* Premium header bar */}
        <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-4">
          <DialogHeader className="space-y-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className={`absolute inset-0 rounded-full bg-primary-foreground/40 blur-md ${
                    state === 'CONNECTED' ? '' : 'animate-pulse'
                  }`}
                />
                <div className="relative bg-primary-foreground/15 border border-primary-foreground/30 rounded-full p-2">
                  <BrandLogo platform={platform} size={24} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base text-primary-foreground">
                  Magic Connect · {displayName}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* State machine telemetry strip */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
            <span className="flex items-center gap-1 font-medium">
              <Wifi className={`h-3 w-3 ${isProgressState ? 'animate-pulse text-primary' : 'text-primary/60'}`} />
              {desc.label}
            </span>
            <span className="font-mono tabular-nums">{desc.percent}%</span>
          </div>
          <Progress value={desc.percent} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <Lock className="h-3 w-3" /> {desc.hint}
          </p>
        </div>

        <div className="px-5 pb-5">
          {state === 'INITIALIZING' && (
            <div className="py-6 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">מקים גשר מאובטח...</p>
            </div>
          )}

          {showPortal && session?.method === 'qr' && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-center font-medium">סרוק את הקוד מאפליקציית WhatsApp</p>
              <div className="mx-auto w-fit relative">
                {/* Corner finders */}
                <div className="absolute -inset-1 rounded-lg border-2 border-primary/40" />
                <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-primary" />
                <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-primary" />
                <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-primary" />
                <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-primary" />
                <div className="rounded-lg bg-background p-3 relative">
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: 'repeat(21, 8px)', gridAutoRows: '8px', gap: '1px' }}
                  >
                    {qrSquares.map((on, i) => (
                      <div key={i} className={on ? 'bg-foreground' : 'bg-background'} />
                    ))}
                  </div>
                  {/* scanning line */}
                  <div className="absolute inset-x-3 top-3 bottom-3 overflow-hidden pointer-events-none">
                    <div className="absolute inset-x-0 h-[2px] bg-primary/60 shadow-[0_0_8px_hsl(var(--primary))] animate-[scan_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                WhatsApp ‹ הגדרות ‹ מכשירים מקושרים ‹ קישור מכשיר
              </p>
              <Button className="w-full" onClick={handleQrConfirm}>
                סרקתי את הקוד
              </Button>
              <style>{`@keyframes scan { 0%,100% { top: 0; } 50% { top: calc(100% - 2px); } }`}</style>
            </div>
          )}

          {showPortal && session?.method === 'otp' && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Login via Secure Bridge</p>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  קוד אימות נשלח ל-{' '}
                  <span className="font-semibold text-foreground">{session.otpTarget}</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">קוד אבטחה (OTP)</label>
                <Input
                  inputMode="numeric"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="text-center tracking-[0.5em] text-lg font-mono"
                />
                {errorMsg && <p className="text-xs text-destructive mt-1">{errorMsg}</p>}
              </div>
              <Button className="w-full" disabled={otp.length < 4} onClick={handleOtpSubmit}>
                אמת והתחבר
              </Button>
            </div>
          )}

          {state === 'SYNCING' && (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse" />
                <Loader2 className="relative h-10 w-10 animate-spin text-primary" />
              </div>
              <p className="text-sm font-medium">מסנכרן עם {displayName}...</p>
              {account && (
                <p className="text-xs text-muted-foreground">{account.accountName}</p>
              )}
            </div>
          )}

          {state === 'CONNECTED' && (
            <div className="py-6 flex flex-col items-center gap-3 animate-scale-in">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/40 blur-xl animate-pulse" />
                <div className="relative bg-primary text-primary-foreground rounded-full p-3">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
              </div>
              <p className="text-base font-semibold">מחובר בהצלחה</p>
              {account && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="text-muted-foreground">Live ·</span>
                  <span className="font-medium">{account.accountName}</span>
                </div>
              )}
              <Button className="w-full mt-2" onClick={() => onOpenChange(false)}>
                סגור
              </Button>
            </div>
          )}

          {state === 'FAILED' && (
            <div className="py-4 space-y-3">
              <p className="text-sm text-destructive text-center">{errorMsg ?? 'אירעה שגיאה במהלך החיבור.'}</p>
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                סגור
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Badge({ state }: { state: ConnectionState }) {
  const map: Record<ConnectionState, { label: string; cls: string }> = {
    IDLE:          { label: 'IDLE',    cls: 'bg-primary-foreground/15 text-primary-foreground' },
    INITIALIZING: { label: 'INIT',    cls: 'bg-primary-foreground/20 text-primary-foreground animate-pulse' },
    AWAITING_AUTH:{ label: 'AUTH',    cls: 'bg-warning/90 text-warning-foreground animate-pulse' },
    SYNCING:      { label: 'SYNC',    cls: 'bg-primary-foreground/25 text-primary-foreground animate-pulse' },
    CONNECTED:    { label: 'LIVE',    cls: 'bg-success/90 text-white' },
    FAILED:       { label: 'FAILED',  cls: 'bg-destructive text-destructive-foreground' },
  };
  const item = map[state];
  return (
    <span className={`text-[9px] font-bold tracking-widest px-2 py-1 rounded-md ${item.cls}`}>
      {item.label}
    </span>
  );
}
