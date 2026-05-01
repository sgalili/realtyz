import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Bot,
  ExternalLink,
  Eye,
  Home,
  MessageSquareText,
  Send,
  Undo2,
  UserRound,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

const ACTION_LABELS: Record<string, { label: string; Icon: typeof Send }> = {
  outbound_message: { label: 'הודעה נשלחה', Icon: Send },
  reply: { label: 'תגובת AI', Icon: Bot },
  comment: { label: 'הודעה נכנסת', Icon: MessageSquareText },
  listing_share: { label: 'נכס הומלץ', Icon: Home },
  client_portal_view: { label: 'הלקוח צפה בפורטל', Icon: Eye },
  ai_message_undo: { label: 'ביטול הודעת AI', Icon: Undo2 },
};

export default function ActivityLog() {
  const { user } = useAuth();

  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['activity-log', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('interaction_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    refetchInterval: 10_000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['activity-log-messages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);
      return data ?? [];
    },
    refetchInterval: 20_000,
  });

  const rows = useMemo(() => {
    const messageRows: ActivityRow[] = messages.map((msg: any) => ({
      id: `msg-${msg.id}`,
      thread_key: msg.lead_id || 'general',
      platform: msg.platform || msg.channel,
      action_type: msg.direction === 'outbound' ? 'outbound_message' : 'comment',
      actor_type:
        msg.sender_type === 'supervisor' || msg.sender_type === 'agent'
          ? 'supervisor'
          : msg.sender_type === 'ai' || msg.sender_type === 'ai_agent'
            ? 'ai_agent'
            : 'lead',
      actor_label: msg.sender_type,
      content: msg.content || '',
      confidence_score: null,
      source_citations: [],
      live_post_url: msg.metadata?.live_post_url || null,
      created_at: msg.created_at || new Date().toISOString(),
    }));
    return [...activity, ...messageRows].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [activity, messages]);

  const grouped = useMemo(
    () =>
      rows.reduce<Record<string, ActivityRow[]>>((acc, row) => {
        acc[row.thread_key] = [...(acc[row.thread_key] || []), row];
        return acc;
      }, {}),
    [rows],
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="relative overflow-hidden rounded-xl bg-primary text-primary-foreground p-6">
        <div className="relative space-y-2">
          <h1 className="text-2xl font-bold">יומן פעילות AI ובקרת תוכן</h1>
          <p className="text-sm text-primary-foreground/80">
            כל אינטראקציה של ה-AI — הודעה נשלחה, פעולה בוצעה, נכס הומלץ — עם
            סימון ברור מי פעל: AI, מפקח אנושי או הלקוח.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">טוען פעילות...</p>
        )}
        {Object.entries(grouped).map(([thread, entries]) => (
          <Card key={thread}>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    שרשור {thread.replace(/^lead:/, '').slice(0, 12)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entries.length} פעולות
                  </p>
                </div>
                <MessageSquareText className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-3 border-r border-border pr-4">
                {entries.map((entry) => {
                  const isAi =
                    entry.actor_type === 'ai_agent' ||
                    entry.actor_type === 'ai';
                  const isSupervisor =
                    entry.actor_type === 'supervisor' ||
                    entry.actor_type === 'agent';
                  const action =
                    ACTION_LABELS[entry.action_type] ?? {
                      label: entry.action_type,
                      Icon: MessageSquareText,
                    };
                  const ActionIcon = action.Icon;
                  return (
                    <div
                      key={entry.id}
                      className="relative rounded-md border border-border/60 bg-background p-3"
                    >
                      <span className="absolute -right-[23px] top-4 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            isAi
                              ? 'secondary'
                              : isSupervisor
                                ? 'default'
                                : 'outline'
                          }
                          className="gap-1"
                        >
                          {isAi ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <UserRound className="h-3 w-3" />
                          )}
                          {isAi
                            ? 'AI Agent'
                            : isSupervisor
                              ? 'Supervisor'
                              : 'מתעניין'}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <ActionIcon className="h-3 w-3" />
                          {action.label}
                        </Badge>
                        {entry.platform && (
                          <Badge variant="outline">{entry.platform}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.created_at), 'dd/MM HH:mm')}
                        </span>
                      </div>
                      {entry.content && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {entry.content}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {typeof entry.confidence_score === 'number' && (
                          <Badge variant="outline">
                            ביטחון {entry.confidence_score}%
                          </Badge>
                        )}
                        {entry.source_citations?.map((source, index) => (
                          <Badge key={index} variant="secondary">
                            מקור: {source.title || index + 1}
                          </Badge>
                        ))}
                        {entry.live_post_url && (
                          <Button asChild size="sm" variant="ghost">
                            <a
                              href={entry.live_post_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" /> צפייה בפוסט
                              החי
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              אין עדיין פעולות להצגה
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
