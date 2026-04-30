import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bot, ExternalLink, MessageSquareText, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getDemoCandidateMessages, getDemoCandidateVoters } from '@/lib/demoData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ActivityRow = {
  id: string;
  thread_key: string;
  platform: string | null;
  action_type: string;
  actor_type: string;
  actor_label: string | null;
  content: string;
  confidence_score: number | null;
  source_citations: Array<{ title?: string }> | null;
  live_post_url: string | null;
  created_at: string;
};

export default function ActivityLog() {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['activity-log', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('interaction_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    refetchInterval: 10_000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['activity-log-messages'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    },
    refetchInterval: 20_000,
  });

  // Live demo ticker: every 4s prepend a fresh AI<->voter exchange to simulate live activity.
  const [liveDemoEntries, setLiveDemoEntries] = useState<ActivityRow[]>([]);
  useEffect(() => {
    if (!isDemoMode) {
      setLiveDemoEntries([]);
      return;
    }
    const voters = getDemoCandidateVoters(demoCandidateId);
    const platforms = ['whatsapp', 'sms', 'instagram', 'tiktok', 'facebook', 'messenger', 'x'];
    const aiReplies = [
      'תודה על הפנייה! העברתי את הבקשה לטיפול ועדכנתי את הפרופיל שלך.',
      'קיבלתי. הצוות יחזור אליך בהקדם עם תשובה מפורטת.',
      'מעולה! סימנתי אותך לעדכונים בנושאים שמעניינים אותך.',
      'שלום! אשמח לעזור. רוצה לקבל מידע נוסף בנושא הזה?',
      'הבנתי את הנקודה שלך - אני מעבירה את זה לראש הצוות עכשיו.',
    ];
    const voterMsgs = [
      'מתי תהיה הפגישה הקרובה באזור שלי?',
      'אפשר פרטים על התוכנית הכלכלית?',
      'אני בעד! איך אפשר לעזור בקמפיין?',
      'יש מקום להתנדבות בקלפי?',
      'ראיתי את הפוסט - מסכים לחלוטין 💪',
    ];
    const tick = () => {
      const voter = voters[Math.floor(Math.random() * Math.max(1, voters.length))];
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const isAi = Math.random() > 0.45;
      const now = new Date().toISOString();
      const id = `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const entry: ActivityRow = {
        id,
        thread_key: voter?.id || `live-thread-${Math.floor(Math.random() * 8)}`,
        platform,
        action_type: isAi ? 'reply' : 'comment',
        actor_type: isAi ? 'ai_agent' : 'voter',
        actor_label: isAi ? 'ai' : 'voter',
        content: isAi
          ? aiReplies[Math.floor(Math.random() * aiReplies.length)]
          : voterMsgs[Math.floor(Math.random() * voterMsgs.length)],
        confidence_score: isAi ? 80 + Math.floor(Math.random() * 18) : null,
        source_citations: isAi ? [{ title: 'ספר מסרים' }] : [],
        live_post_url: null,
        created_at: now,
      };
      setLiveDemoEntries((prev) => [entry, ...prev].slice(0, 60));
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [isDemoMode, demoCandidateId]);

  const rows = useMemo(() => {
    if (isDemoMode) {
      const baseDemo = getDemoCandidateMessages(demoCandidateId).slice(0, 36).map((msg, index) => ({
        id: `demo-activity-${msg.id}`,
        thread_key: msg.voter_id || 'demo',
        platform: msg.platform || msg.channel,
        action_type: msg.direction === 'outbound' ? 'reply' : 'comment',
        actor_type: msg.sender_type === 'ai' ? 'ai_agent' : 'voter',
        actor_label: msg.sender_type,
        content: msg.content || '',
        confidence_score: msg.sender_type === 'ai' ? 82 + (index % 16) : null,
        source_citations: msg.sender_type === 'ai' ? [{ title: 'ספר מסרים' }] : [],
        live_post_url: null,
        created_at: msg.created_at || new Date().toISOString(),
      })) as ActivityRow[];
      return [...liveDemoEntries, ...baseDemo].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    const messageRows: ActivityRow[] = messages.map((msg: any) => ({
      id: `msg-${msg.id}`,
      thread_key: msg.voter_id || 'general',
      platform: msg.platform || msg.channel,
      action_type: msg.direction === 'outbound' ? 'reply' : 'comment',
      actor_type: msg.sender_type === 'supervisor' || msg.sender_type === 'agent' ? 'supervisor' : msg.sender_type === 'ai' ? 'ai_agent' : 'voter',
      actor_label: msg.sender_type,
      content: msg.content || '',
      confidence_score: null,
      source_citations: [],
      live_post_url: msg.metadata?.live_post_url || null,
      created_at: msg.created_at || new Date().toISOString(),
    }));
    return [...activity, ...messageRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activity, demoCandidateId, isDemoMode, messages, liveDemoEntries]);

  const grouped = useMemo(() => rows.reduce<Record<string, ActivityRow[]>>((acc, row) => {
    acc[row.thread_key] = [...(acc[row.thread_key] || []), row];
    return acc;
  }, {}), [rows]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="relative overflow-hidden rounded-xl bg-primary text-primary-foreground p-6">
        <div className="relative space-y-2">
          <h1 className="text-2xl font-bold">יומן פעילות ובקרת תוכן</h1>
          <p className="text-sm text-primary-foreground/80">תצוגה מושחלת של תגובות, תשובות ופעולות - עם סימון ברור מי פעל: AI או מפקח אנושי.</p>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">טוען פעילות...</p>}
        {Object.entries(grouped).map(([thread, entries]) => (
          <Card key={thread}>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">שרשור {thread.slice(0, 12)}</p>
                  <p className="text-xs text-muted-foreground">{entries.length} פעולות</p>
                </div>
                <MessageSquareText className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-3 border-r border-border pr-4">
                {entries.map((entry) => {
                  const isAi = entry.actor_type === 'ai_agent' || entry.actor_type === 'ai';
                  const isSupervisor = entry.actor_type === 'supervisor' || entry.actor_type === 'agent';
                  return (
                    <div key={entry.id} className="relative rounded-md border border-border/60 bg-background p-3">
                      <span className="absolute -right-[23px] top-4 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant={isAi ? 'secondary' : isSupervisor ? 'default' : 'outline'} className="gap-1">
                          {isAi ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                          {isAi ? 'AI Agent' : isSupervisor ? 'Supervisor' : 'בוחר'}
                        </Badge>
                        <Badge variant="outline">{entry.platform || 'כללי'}</Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(entry.created_at), 'dd/MM HH:mm')}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {typeof entry.confidence_score === 'number' && <Badge variant="outline">ביטחון {entry.confidence_score}%</Badge>}
                        {entry.source_citations?.map((source, index) => <Badge key={index} variant="secondary">מקור: {source.title || index + 1}</Badge>)}
                        {entry.live_post_url && <Button asChild size="sm" variant="ghost"><a href={entry.live_post_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> צפייה בפוסט החי</a></Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">אין עדיין פעולות להצגה</CardContent></Card>}
      </div>
    </div>
  );
}
