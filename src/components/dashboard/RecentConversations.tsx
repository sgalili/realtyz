import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import VoterAvatar from '@/components/VoterAvatar';

interface ChatRow {
  id: string;
  lead_id: string | null;
  role: string | null;
  content: string | null;
  created_at: string | null;
}

interface VoterInfo {
  id: string;
  full_name: string | null;
  profile_picture_url: string | null;
}

const RecentConversations = () => {
  const [selectedVoter, setSelectedVoter] = useState<VoterInfo | null>(null);

  // Recent chat messages with lead info
  const { data: recentChats } = useQuery({
    queryKey: ['recent-chats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_history')
        .select('id, lead_id, role, content, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!data || data.length === 0) return [];

      // Get unique lead IDs
      const voterIds = [...new Set(data.map((c) => c.lead_id).filter(Boolean))] as string[];
      const { data: voters } = await supabase
        .from('leads')
        .select('id, full_name, profile_picture_url')
        .in('id', voterIds);

      const voterMap = new Map((voters ?? []).map((v) => [v.id, v]));

      // Group by lead, keep latest message per lead
      const byVoter = new Map<string, { voter: VoterInfo; lastMsg: ChatRow; count: number }>();
      for (const msg of data) {
        if (!msg.lead_id) continue;
        if (!byVoter.has(msg.lead_id)) {
          const v = voterMap.get(msg.lead_id);
          byVoter.set(msg.lead_id, {
            voter: v ?? { id: msg.lead_id, full_name: null, profile_picture_url: null },
            lastMsg: msg,
            count: 1,
          });
        } else {
          byVoter.get(msg.lead_id)!.count++;
        }
      }

      return Array.from(byVoter.values()).slice(0, 6);
    },
  });

  // Timeline for selected lead
  const { data: timeline } = useQuery({
    queryKey: ['lead-timeline', selectedVoter?.id],
    enabled: !!selectedVoter,
    queryFn: async () => {
      const { data } = await supabase
        .from('chat_history')
        .select('*')
        .eq('lead_id', selectedVoter!.id)
        .order('created_at', { ascending: true })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            שיחות אחרונות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!recentChats || recentChats.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">אין שיחות עדיין</p>
          )}
          <div className="space-y-2">
            {recentChats?.map(({ voter, lastMsg, count }) => (
              <button
                key={voter.id}
                onClick={() => setSelectedVoter(voter)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-start"
              >
                <VoterAvatar fullName={voter.full_name} profilePictureUrl={voter.profile_picture_url} className="h-8 w-8" textClassName="text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{voter.full_name || 'מתעניין לא ידוע'}</p>
                  <p className="text-xs text-muted-foreground truncate">{lastMsg.content}</p>
                </div>
                <div className="text-left shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {lastMsg.created_at ? format(new Date(lastMsg.created_at), 'HH:mm') : ''}
                  </span>
                  {count > 1 && (
                    <div className="mt-0.5 text-[10px] bg-primary/15 text-primary rounded-full px-1.5 text-center">
                      {count}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline Dialog */}
      <Dialog open={!!selectedVoter} onOpenChange={() => setSelectedVoter(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <VoterAvatar fullName={selectedVoter?.full_name ?? null} profilePictureUrl={selectedVoter?.profile_picture_url ?? null} className="h-8 w-8" textClassName="text-xs" />
              ציר זמן - {selectedVoter?.full_name || 'מתעניין'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 p-1">
              {timeline?.map((msg) => {
                const isAI = msg.role === 'assistant' || msg.role === 'ai';
                return (
                  <div key={msg.id} className={`flex gap-2 ${isAI ? '' : 'flex-row-reverse'}`}>
                    <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${isAI ? 'bg-primary/15' : 'bg-accent'}`}>
                      {isAI ? <Bot className="h-3.5 w-3.5 text-primary" /> : <User className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isAI ? 'bg-muted' : 'bg-primary/10'}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {msg.created_at ? format(new Date(msg.created_at), 'dd/MM HH:mm') : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
              {timeline?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">אין הודעות</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RecentConversations;
