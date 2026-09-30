import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import Mailbox from '@/pages/Mailbox';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { GoogleServiceConnectCard } from '@/components/profile/GoogleServiceConnectCard';

export function useWorkspaceMailbox() {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  return useQuery({
    queryKey: ['workspace-mailbox', workspaceOwnerId],
    enabled: !!workspaceOwnerId,
    queryFn: async () => ((await supabase.rpc('get_workspace_mailbox' as never)).data ?? {}) as any,
  });
}

export function WorkspaceMailboxCard() {
  const qc = useQueryClient();
  const { data: mb } = useWorkspaceMailbox();
  const useRealtyz = mb?.provider === 'realtyz';

  const setProvider = async (realtyz: boolean) => {
    const { error } = await supabase.rpc('set_workspace_email_provider' as never, { p_provider: realtyz ? 'realtyz' : 'gmail' } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ['workspace-mailbox'] });
    toast.success(realtyz ? 'השליחה תתבצע מכתובת Realtyz' : 'השליחה תתבצע דרך Gmail');
  };

  return (
    <div data-plain className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium">תיבה לשליחה</span>
        <div className="flex items-center gap-2 text-sm">
          <span className={!useRealtyz ? 'font-semibold text-destructive' : 'text-muted-foreground'}>Gmail</span>
          <Switch
            dir="ltr"
            checked={useRealtyz}
            onCheckedChange={setProvider}
            aria-label="בחירת תיבת מייל"
            className="data-[state=checked]:!bg-primary data-[state=unchecked]:!bg-destructive"
          />
          <span className={useRealtyz ? 'font-semibold text-primary' : 'text-muted-foreground'}>Realtyz</span>
        </div>
      </div>
      {!useRealtyz && (
        <GoogleServiceConnectCard
          platform="gmail"
          title="Gmail"
          hint="שליחה וקבלה של מיילים מהמערכת."
          ctaLabel="חיבור Gmail"
          brand="gmail"
        />
      )}
      <Mailbox embedded />
    </div>
  );
}
