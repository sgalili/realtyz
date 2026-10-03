import { useEffect, useRef, useState } from 'react';
import { Megaphone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { REPOST_EDITOR_EVENT, matchesRepostJob, type RepostPost } from '@/lib/repostEditor';
import { toast } from 'sonner';

export function ContinuePostingButton({ post }: { post: RepostPost }) {
  const owner = useActiveWorkspaceOwnerId();
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(false); }, [owner]);

  const prepare = async () => {
    if (!owner || busy) return;
    setBusy(true);
    try {
      const data: any[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('campaign_activity_queue').select('id,status,payload,target_ref,scheduled_for')
          .eq('workspace_owner_id', owner).eq('activity_type', 'fb_group_post').order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        data.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 500) break;
      }
      if (ownerRef.current !== owner) return;
      const posts = post._seriesSlots?.length ? [post, ...post._seriesSlots] : [post];
      const matched = data.filter((job) => posts.some((p) => matchesRepostJob(job, p)));
      window.dispatchEvent(new CustomEvent(REPOST_EDITOR_EVENT, { detail: { owner, post, jobs: matched } }));
    } catch (error) { toast.error(error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-md border-border bg-background" title="המשך / פרסום מחדש" aria-label="המשך / פרסום מחדש" disabled={busy} onClick={(e) => { e.stopPropagation(); void prepare(); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
    </Button>
  </>;
}