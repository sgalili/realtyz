import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Lock, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Comment = {
  id: string;
  body: string;
  author_id: string;
  author_email: string | null;
  created_at: string;
};

function initials(email?: string | null) {
  if (!email) return '?';
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DealRoomComments({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['deal-room-comments', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_room_comments')
        .select('id, body, author_id, author_email, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as Comment[];
    },
    enabled: !!leadId,
  });

  async function postComment() {
    const body = draft.trim();
    if (!body || !user || posting) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('deal_room_comments').insert({
        lead_id: leadId,
        author_id: user.id,
        author_email: user.email ?? null,
        body,
      });
      if (error) throw error;
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['deal-room-comments', leadId] });
    } catch (e: any) {
      toast.error('Could not post comment', { description: e?.message });
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from('deal_room_comments').delete().eq('id', id);
    if (error) {
      toast.error('Could not delete', { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['deal-room-comments', leadId] });
  }

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Internal Team Notes</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          Visible to your team only · never sent to the prospect
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No internal notes yet. Start the conversation with your team.
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2 group">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px]">{initials(c.author_email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium truncate">{c.author_email || 'Teammate'}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                  {c.author_id === user?.id && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t p-2 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave an internal note for your team…"
          rows={2}
          className="text-sm resize-none"
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              postComment();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
          <Button size="sm" onClick={postComment} disabled={!draft.trim() || posting}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {posting ? 'Posting…' : 'Post note'}
          </Button>
        </div>
      </div>
    </div>
  );
}
