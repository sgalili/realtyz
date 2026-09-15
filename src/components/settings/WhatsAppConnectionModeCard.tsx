import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Mode = 'official_meta' | 'qr_session';

const OPTIONS: Array<{ value: Mode; title: string; hint: string }> = [
  {
    value: 'official_meta',
    title: 'מספר Realtyz הרשמי (Meta)',
    hint: '',
  },
  {
    value: 'qr_session',
    title: 'מספר ווטסאפ אישי ',
    hint: '',
  },
];

/**
 * Workspace-wide WhatsApp method selection. The chosen method applies to every
 * message the workspace sends and receives across the app.
 * Exception: verification codes (OTP) always ship from the official Realtyz
 * Meta number, whatever is selected here.
 */
export function WhatsAppConnectionModeCard() {
  const ownerId = useActiveWorkspaceOwnerId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Mode | null>(null);
  const [mode, setMode] = useState<Mode>('official_meta');

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('workspace_whatsapp_settings' as never)
        .select('connection_type')
        .eq('workspace_owner_id', ownerId)
        .maybeSingle();
      if (cancelled) return;
      const value = String((data as any)?.connection_type ?? 'official_meta');
      setMode(value === 'qr_session' ? 'qr_session' : 'official_meta');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  const choose = async (value: Mode) => {
    if (!ownerId || value === mode) return;
    setSaving(value);
    const { error } = await supabase
      .from('workspace_whatsapp_settings' as never)
      .upsert(
        { workspace_owner_id: ownerId, connection_type: value } as never,
        { onConflict: 'workspace_owner_id' } as never,
      );
    setSaving(null);
    if (error) {
      toast.error('שמירת אופן החיבור נכשלה', { description: error.message });
      return;
    }
    setMode(value);
    toast.success(
      value === 'qr_session'
        ? 'כל ההודעות במרחב העבודה יישלחו מהמספר האישי'
        : 'כל ההודעות במרחב העבודה יישלחו מהמספר הרשמי של Meta',
    );
  };

  return (
    <Card data-keep dir="rtl" className="border-0 bg-transparent shadow-none">
      <CardContent className="space-y-2 p-0">
        <p className="text-xs text-muted-foreground">
          
        </p>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="space-y-2">
            {OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(opt.value)}
                  disabled={!!saving}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-right transition-colors',
                    active ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{opt.title}</span>
                    <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                  {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WhatsAppConnectionModeCard;
