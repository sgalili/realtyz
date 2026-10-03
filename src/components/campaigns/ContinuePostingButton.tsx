import { useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { fbGroupId } from '@/lib/fbGroupUrl';
import { applyContinuedQueueJobs, mirrorQueueToCloud, readPostQueue } from '@/lib/extensionGroupBridge';
import { toast } from 'sonner';

type Post = { id: string; message_body?: string | null; group_ids?: string[]; sent_at?: string | null; _seriesSlots?: Post[] };
const done = new Set(['completed', 'published', 'success']);
const failed = new Set(['failed', 'error']);

export function ContinuePostingButton({ post }: { post: Post }) {
  const owner = useActiveWorkspaceOwnerId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  useEffect(() => { setOpen(false); setJobs([]); }, [owner]);

  const prepare = async () => {
    if (!owner || busy) return;
    setBusy(true);
    try {
      await mirrorQueueToCloud(readPostQueue(owner));
      const { data, error } = await supabase.from('campaign_activity_queue').select('id,status,payload,target_ref,scheduled_for')
        .eq('workspace_owner_id', owner).eq('activity_type', 'fb_group_post').order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      const posts = post._seriesSlots?.length ? [post, ...post._seriesSlots] : [post];
      const matched = (data ?? []).filter((job) => posts.some((p) => {
        const payload = job.payload as any;
        if (payload?.campaign_log_id === p.id) return true;
        const body = payload?.job?.sourceText || payload?.job?.text || payload?.body || payload?.text;
        const group = fbGroupId(payload?.job?.groupUrl || payload?.group_url || job.target_ref);
        return !!body && body === p.message_body && !!group && (p.group_ids ?? []).some((g) => fbGroupId(g) === group)
          && (!p.sent_at || new Date(p.sent_at).getTime() === new Date(job.scheduled_for).getTime());
      }));
      if (!matched.length) throw new Error('לא נמצאו עבודות מקוריות לפוסט הזה. לא נוצר תור חדש כדי למנוע שינוי בתוכן או בקבוצות.');
      setJobs(matched);
      setOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const resubmit = jobs.length > 0 && jobs.every((j) => done.has(j.status));
  const eligible = jobs.filter((j) => failed.has(j.status) || (resubmit && done.has(j.status)));
  const confirm = async () => {
    if (!owner || busy || !eligible.length) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('continue_group_post_jobs', {
        _workspace_owner_id: owner, _job_ids: eligible.map((j) => j.id), _resubmit: resubmit,
      });
      if (error) throw error;
      applyContinuedQueueJobs(owner, data ?? []);
      toast.success(data?.length ? `${data.length} עבודות הוחזרו לתור` : 'לא שונו עבודות: התור כבר פעיל או שהסטטוס השתנה');
      setOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="המשך / פרסום מחדש" aria-label="המשך / פרסום מחדש" disabled={busy} onClick={(e) => { e.stopPropagation(); void prepare(); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent dir="rtl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>{resubmit ? 'פרסום מחדש' : 'המשך פרסום'}</DialogTitle>
          <DialogDescription>{resubmit ? 'כל העבודות הושלמו. אישור יפרסם שוב לאותן קבוצות ועלול ליצור פוסטים כפולים.' : eligible.length ? 'רק עבודות שנכשלו יוחזרו לתור. קבוצות שפורסמו ועבודות פעילות לא יופעלו שוב.' : 'התור כבר פעיל או שהפרסום הושלם. אין עבודות שנכשלו להמשך.'} התוכן, התמונות, התגובה הראשונה והמועדים המקוריים יישמרו.</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button disabled={busy || !eligible.length} onClick={() => void confirm()}>{busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{resubmit ? 'אישור פרסום מחדש' : 'אישור המשך פרסום'}</Button><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}