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

  // Icon-only control. Deselected (muted) by default; live green only once the
  // extension is actually paired with this workspace.
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={connected ? 'פרסום מחובר' : 'חיבור פרסום'}
      aria-pressed={connected}
      className={cn(
        'h-8 w-8 shrink-0 rounded-md border transition-colors',
        connected
          ? 'border-emerald-600 bg-emerald-600 text-primary-foreground hover:bg-emerald-600/90'
          : 'border-border bg-muted text-muted-foreground hover:bg-muted/80',
        className,
      )}
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
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : connected ? (
        <ShieldCheck className="h-4 w-4" />
      ) : (
        <Link2 className="h-4 w-4" />
      )}
    </Button>
  );
}

export default ExtensionPairingButton;
