import { useEffect, useState } from 'react';
import { Instagram, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFacebookHealth } from '@/hooks/useFacebookHealth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { startMetaPageConnect } from '@/lib/facebookPageConnect';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { openFacebookConnection } from '@/lib/facebookConnectionFlow';

export function InstagramConnectGate({ onStatusChange }: { onStatusChange: (ready: boolean) => void }) {
  const owner = useActiveWorkspaceOwnerId();
  const { data: health, isPending } = useFacebookHealth();
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connected = !!health?.instagram?.id && !!health?.pageConnected && !health?.needsReconnect;
  useEffect(() => { setSkipped(false); setError(''); }, [owner]);
  useEffect(() => { onStatusChange(connected || skipped); }, [connected, skipped, owner, onStatusChange]);
  const connect = async () => {
    setBusy(true); setError('');
    try { openFacebookConnection(); }
    catch (e) { setError(e instanceof Error ? e.message : 'החיבור לא הושלם'); }
    finally { setBusy(false); }
  };
  if (connected || skipped) return null;
  return <section dir="rtl" className="space-y-3" aria-label="חיבור אינסטגרם">
    <Button onClick={() => void connect()} disabled={busy || isPending || !owner} className="instagram-connect-button h-12 w-full gap-2 text-base">
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Instagram className="h-5 w-5" />}חיבור באמצעות אינסטגרם
    </Button>
    <p className="text-sm text-muted-foreground">החיבור המאובטח דרך Meta מיועד לחשבון אינסטגרם מקצועי המקושר לעמוד פייסבוק. זמינות הפרסום וההודעות תלויה בהרשאות שאושרו לחשבון.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="link" className="w-full" disabled={busy} onClick={() => setSkipped(true)}>אתחבר יותר מאוחר</Button>
  </section>;
}