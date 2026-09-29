import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import Mailbox from '@/pages/Mailbox';

export function useWorkspaceMailbox() {
  return useQuery({
    queryKey: ['workspace-mailbox'],
    queryFn: async () => ((await supabase.rpc('get_workspace_mailbox' as never)).data ?? {}) as any,
  });
}

export function WorkspaceMailboxCard() {
  const qc = useQueryClient();
  const { data: mb } = useWorkspaceMailbox();
  const useRealtyz = mb?.provider === 'realtyz';

  const setProvider = async (realtyz: boolean) => {
    if (realtyz && !mb?.address) return toast.error('יש להגדיר קודם כתובת @realtyz.co.il');
    if (!realtyz && !mb?.gmail_connected) return toast.error('Gmail אינו מחובר. יש לחבר אותו בכרטיס גוגל');
    const { error } = await supabase.rpc('set_workspace_email_provider' as never, { p_provider: realtyz ? 'realtyz' : 'gmail' } as never);
    if (error) return toast.error(error.message.includes('only_workspace_owner') ? 'רק בעל מרחב העבודה יכול לשנות' : error.message);
    qc.invalidateQueries({ queryKey: ['workspace-mailbox'] });
    toast.success(realtyz ? 'השליחה תתבצע מכתובת Realtyz' : 'השליחה תתבצע דרך Gmail');
  };

  return (
    <div data-plain className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium">תיבה לשליחה</span>
        <div className="flex items-center gap-2 text-sm">
          <span className={!useRealtyz ? 'font-semibold' : 'text-muted-foreground'}>Gmail</span>
          <Switch dir="ltr" checked={useRealtyz} onCheckedChange={setProvider} disabled={mb?.is_owner === false} aria-label="בחירת תיבת מייל" />
          <span className={useRealtyz ? 'font-semibold' : 'text-muted-foreground'}>Realtyz</span>
        </div>
      </div>
      <Mailbox embedded />
    </div>
  );
}
