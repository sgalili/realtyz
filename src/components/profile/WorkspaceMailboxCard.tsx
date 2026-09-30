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
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { data: mb } = useWorkspaceMailbox();
  const useGmail = mb?.provider !== 'realtyz';

  const setProvider = async (gmail: boolean) => {
    const provider = gmail ? 'gmail' : 'realtyz';
    const key = ['workspace-mailbox', workspaceOwnerId];
    const prev = qc.getQueryData(key);
    // Optimistic: the collapsed card header updates instantly.
    qc.setQueryData(key, (old: any) => ({ ...(old ?? {}), provider }));
    const { error } = await supabase.rpc('set_workspace_email_provider' as never, { p_provider: provider } as never);
    if (error) {
      qc.setQueryData(key, prev);
      return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ['workspace-mailbox'] });
    toast.success(gmail ? 'השליחה תתבצע דרך Gmail' : 'השליחה תתבצע מכתובת Realtyz');
  };

  return (
    <div data-plain className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3" dir="rtl">
        <span className="text-sm font-medium">תיבה לשליחה</span>
        {/* RTL: Gmail on the right, Realtyz on the left; the thumb moves toward the active label. */}
        <div className="flex items-center gap-2 text-sm" dir="rtl">
          <span className={useGmail ? 'font-semibold text-destructive' : 'text-muted-foreground'}>Gmail</span>
          <Switch
            dir="rtl"
            checked={useGmail}
            onCheckedChange={setProvider}
            aria-label="בחירת תיבת מייל"
            className="data-[state=checked]:!bg-destructive data-[state=unchecked]:!bg-primary [&>span]:data-[state=checked]:!translate-x-0 [&>span]:data-[state=unchecked]:!-translate-x-5 rtl:[&>span]:data-[state=checked]:!translate-x-0"
          />
          <span className={!useGmail ? 'font-semibold text-primary' : 'text-muted-foreground'}>Realtyz</span>
        </div>
      </div>
      {useGmail && (
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
