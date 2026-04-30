import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarClock, CheckCircle2, ExternalLink, EyeOff, Pencil, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getDemoApprovalQueue } from '@/lib/demoData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ApprovalItem = {
  id: string;
  title: string;
  platform: string;
  content_type: string;
  proposed_content: string;
  edited_content: string | null;
  status: string;
  confidence_score: number;
  low_confidence_reason: string | null;
  target_voter_id: string | null;
  target_label: string | null;
  source_citations: Array<{ title?: string; url?: string }> | null;
  live_post_url: string | null;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר - ממתין לפרסום ידני',
  scheduled: 'תוזמן ביומן',
  rejected: 'נדחה',
  posted: 'פורסם ידנית',
};

export default function ApprovalQueue() {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<Record<string, string>>({});
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});

  const { data: dbItems = [], isLoading } = useQuery({
    queryKey: ['approval-queue', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('approval_queue')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalItem[];
    },
    refetchInterval: 15_000,
  });

  const items = useMemo(() => {
    if (isDemoMode) {
      const demo = getDemoApprovalQueue(demoCandidateId) as ApprovalItem[];
      return [...demo, ...dbItems];
    }
    return dbItems;
  }, [isDemoMode, demoCandidateId, dbItems]);

  const counts = useMemo(() => ({
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved').length,
    posted: items.filter((item) => item.status === 'posted').length,
  }), [items]);

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from('approval_queue').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-queue'] });
      qc.invalidateQueries({ queryKey: ['activity-log'] });
    },
    onError: () => toast.error('הפעולה נכשלה'),
  });

  const publishItem = useMutation({
    mutationFn: async (item: ApprovalItem) => {
      const content = item.edited_content || item.proposed_content;
      if (item.content_type === 'outbound_message' && item.target_voter_id) {
        const { error: messageError } = await supabase.from('messages').insert({
          voter_id: item.target_voter_id,
          content,
          direction: 'outbound',
          sender_type: 'supervisor',
          channel: item.platform,
          metadata: { approval_queue_id: item.id, human_approved: true },
        } as any);
        if (messageError) throw messageError;
      }
      const { error: logError } = await (supabase as any).from('interaction_activity_log').insert({
        user_id: user!.id,
        thread_key: item.target_voter_id || `${item.platform}-${item.id}`,
        platform: item.platform,
        action_type: item.content_type,
        actor_type: 'supervisor',
        actor_id: user!.id,
        actor_label: 'Supervisor',
        content,
        confidence_score: item.confidence_score,
        source_citations: item.source_citations || [],
        approval_queue_id: item.id,
        live_post_url: item.live_post_url,
        metadata: { human_final_authority: true },
      });
      if (logError) throw logError;
      const { error } = await (supabase as any).from('approval_queue').update({ status: 'scheduled', posted_by: user!.id, posted_at: new Date().toISOString() }).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הפעולה בוצעה ידנית ונרשמה ביומן');
      qc.invalidateQueries({ queryKey: ['approval-queue'] });
      qc.invalidateQueries({ queryKey: ['activity-log'] });
    },
    onError: () => toast.error('פרסום ידני נכשל'),
  });

  const scheduleItem = useMutation({
    mutationFn: async (item: ApprovalItem) => {
      const when = scheduleAt[item.id];
      if (!when) throw new Error('missing-date');
      const content = editing[item.id] || item.edited_content || item.proposed_content;
      const { error: scheduleError } = await (supabase as any).from('scheduled_items').insert({
        user_id: user!.id,
        approval_queue_id: item.id,
        title: item.title,
        content,
        item_type: item.content_type === 'outbound_message' ? 'sms_campaign' : 'social_post',
        channel: item.platform,
        status: 'approved',
        scheduled_for: new Date(when).toISOString(),
        target_audience: item.target_label,
        drip_enabled: Boolean((item as any).metadata?.drip_feed?.enabled),
        daily_limit: (item as any).metadata?.drip_feed?.daily_limit || 0,
        send_window_start: (item as any).metadata?.drip_feed?.send_window_start || '08:00',
        send_window_end: (item as any).metadata?.drip_feed?.send_window_end || '20:00',
        metadata: { human_approved: true, source: 'approval_queue' },
      });
      if (scheduleError) throw scheduleError;
      const { error } = await (supabase as any).from('approval_queue').update({ status: 'posted', posted_by: user!.id, posted_at: new Date().toISOString() }).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הפריט תוזמן ביומן לאחר אישור אנושי');
      qc.invalidateQueries({ queryKey: ['approval-queue'] });
      qc.invalidateQueries({ queryKey: ['scheduled-items'] });
    },
    onError: () => toast.error('תזמון הפריט נכשל'),
  });

  const approve = (item: ApprovalItem) => updateItem.mutate({
    id: item.id,
    patch: { status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString(), edited_content: editing[item.id] || item.edited_content },
  }, { onSuccess: () => toast.success('אושר - עדיין לא פורסם עד לחיצה ידנית') });

  const reject = (item: ApprovalItem) => updateItem.mutate({
    id: item.id,
    patch: { status: 'rejected', rejected_by: user?.id, rejected_at: new Date().toISOString(), rejection_reason: rejecting[item.id] || 'נדחה על ידי המפקח' },
  }, { onSuccess: () => toast.success('התוכן נדחה ולא יפורסם') });

  const visibleByTab = (tab: string) => tab === 'all' ? items : items.filter((item) => item.status === tab);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-primary">תור אישורים</h2>
        <p className="text-sm text-muted-foreground">האדם הוא הסמכות הסופית: AI מכין, מפקח מאשר, ורק לחיצה ידנית מוציאה תוכן החוצה.</p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <QueueStat label="ממתינים" value={counts.pending} />
        <QueueStat label="אושרו לפרסום ידני" value={counts.approved} />
        <QueueStat label="פורסמו ידנית" value={counts.posted} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">ממתינים</TabsTrigger>
          <TabsTrigger value="approved">מאושרים</TabsTrigger>
          <TabsTrigger value="posted">פורסמו</TabsTrigger>
          <TabsTrigger value="rejected">נדחו</TabsTrigger>
          <TabsTrigger value="all">הכול</TabsTrigger>
        </TabsList>
        {['pending', 'approved', 'posted', 'rejected', 'all'].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">טוען תור אישורים...</p>}
            {visibleByTab(tab).map((item) => (
              <Card key={item.id} className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription>{format(new Date(item.created_at), 'dd/MM HH:mm')} · {item.target_label || item.platform}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={item.status === 'pending' ? 'default' : 'secondary'}>{statusLabels[item.status] || item.status}</Badge>
                      <Badge variant="outline">ביטחון {item.confidence_score}%</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.low_confidence_reason && <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-foreground">{item.low_confidence_reason}</p>}
                  <Textarea value={editing[item.id] ?? item.edited_content ?? item.proposed_content} onChange={(e) => setEditing((cur) => ({ ...cur, [item.id]: e.target.value }))} className="min-h-32 bg-background" />
                  {item.source_citations && item.source_citations.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">מקורות: {item.source_citations.map((source, index) => <Badge key={index} variant="outline">{source.title || `מקור ${index + 1}`}</Badge>)}</div>
                  )}
                  {item.status === 'pending' && (
                    <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                      <Input placeholder="סיבת דחייה אופציונלית" value={rejecting[item.id] || ''} onChange={(e) => setRejecting((cur) => ({ ...cur, [item.id]: e.target.value }))} />
                      <Button variant="outline" onClick={() => updateItem.mutate({ id: item.id, patch: { edited_content: editing[item.id] ?? item.proposed_content } }, { onSuccess: () => toast.success('העריכה נשמרה') })}><Pencil className="h-4 w-4" /> שמור עריכה</Button>
                      <Button onClick={() => approve(item)}><CheckCircle2 className="h-4 w-4" /> אשר</Button>
                      <Button variant="destructive" onClick={() => reject(item)}><XCircle className="h-4 w-4" /> דחה</Button>
                    </div>
                  )}
                  {item.status === 'approved' && <div className="grid gap-2 md:grid-cols-[auto_1fr_auto]"><Button onClick={() => publishItem.mutate(item)}><Send className="h-4 w-4" /> פרסום עכשיו</Button><Input type="datetime-local" value={scheduleAt[item.id] || ''} onChange={(e) => setScheduleAt((cur) => ({ ...cur, [item.id]: e.target.value }))} /><Button variant="outline" onClick={() => scheduleItem.mutate(item)}><CalendarClock className="h-4 w-4" /> תזמון</Button></div>}
                  {item.live_post_url && <Button asChild variant="ghost" size="sm"><a href={item.live_post_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> צפייה בפוסט החי</a></Button>}
                </CardContent>
              </Card>
            ))}
            {!isLoading && visibleByTab(tab).length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><EyeOff className="mx-auto mb-2 h-8 w-8 opacity-30" />אין פריטים בסטטוס זה</CardContent></Card>}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></CardContent></Card>;
}
