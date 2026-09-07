import { useEffect, useState } from 'react';
import { Link2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { pairExtension, pokeExtension, readRunnerStatus, type ExtensionRunnerStatus } from '@/lib/extensionPairing';

/**
 * "חיבור פרסום" — connects the installed extension to this workspace so the
 * scheduled group-post queue runs locally in the broker's own browser.
 */
export function ExtensionPairingButton({ className }: { className?: string }) {
  const [status, setStatus] = useState<ExtensionRunnerStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const s = await readRunnerStatus();
      if (alive) setStatus(s);
    };
    void check();
    const id = window.setInterval(check, 15000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const connected = !!status?.paired;

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (connected) {
        pokeExtension();
        toast.success('התוסף התבקש לבדוק את תור הפרסום עכשיו');
        return;
      }
      const res = await pairExtension();
      if (!res.ok) {
        toast.error('חיבור התוסף נכשל', { description: res.reason });
        return;
      }
      toast.success('התוסף מחובר — הפוסטים המתוזמנים יפורסמו מהדפדפן שלך');
      setStatus(await readRunnerStatus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={connected ? 'outline' : 'default'}
      className={cn('h-8 gap-1 text-[12px]', className)}
      title={
        connected
          ? status?.lastError
            ? `התוסף מחובר. תקלה אחרונה: ${status.lastError}`
            : 'התוסף מחובר ומפרסם את התור מהדפדפן שלך'
          : 'חבר את התוסף כדי לפרסם את התור המתוזמן מהדפדפן שלך'
      }
      disabled={busy}
      onClick={() => void onClick()}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : connected ? (
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      {connected ? 'פרסום מחובר' : 'חיבור פרסום'}
    </Button>
  );
}

export default ExtensionPairingButton;
