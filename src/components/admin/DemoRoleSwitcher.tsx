import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, Clapperboard, Home, Loader2, Megaphone, Search, Share2, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DEMO_TYPES, type DemoType } from '@/pages/demo/demoData';
import { DEMO_HOME, startDemoSession } from '@/lib/demoView';

const DEMO_ICONS: Record<DemoType, LucideIcon> = {
  broker: Store, marketing: Megaphone, developer: Building2, owner: Home, buyer: Search, affiliate: Share2,
};

/**
 * Super Admin-only row in the sidebar workspace list. Opens the view-only demo
 * workspace of the chosen user type on the real app screens.
 */
export function DemoRoleSwitcher({ onEntered }: { onEntered?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DemoType | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = async (type: DemoType) => {
    setBusy(true);
    try {
      await startDemoSession(type);
      onEntered?.();
      navigate(DEMO_HOME[type], { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'לא ניתן לפתוח את הדמו');
    } finally { setBusy(false); setPending(null); }
  };

  return (
    <div dir="rtl" className="border-b border-border pb-1 mb-1">
      <Button type="button" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex h-auto w-full items-center justify-start gap-2.5 rounded-md px-2 py-2 text-right text-sm hover:bg-primary/10">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background"><Clapperboard className="h-3.5 w-3.5 text-primary" /></span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">חשבון דמו / מצב הדגמה</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (pending ? (
        <div className="space-y-2 px-2 py-2 text-xs">
          <p>כניסה לדמו תנתק אותך מהחשבון הנוכחי. אפשר לחזור אליו בכניסה רגילה.</p>
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending(null)}>ביטול</Button>
            <Button size="sm" disabled={busy} onClick={() => enter(pending)}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}כניסה לדמו</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1 px-1 pb-1">
          {DEMO_TYPES.map((t) => {
            const Icon = DEMO_ICONS[t.id];
            return (
              <Button key={t.id} type="button" size="sm" variant="outline" aria-label={`כניסה לדמו: ${t.label}`}
                onClick={() => setPending(t.id)} className="h-auto justify-start gap-1.5 px-2 py-1.5 text-[11px]">
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{t.label}</span>
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default DemoRoleSwitcher;
