import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import VoterAvatar from '@/components/VoterAvatar';
import {
  Sparkles,
  Send,
  Clock,
  UserPlus,
  Megaphone,
  Handshake,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ListingOutreachDialog } from '@/components/dealroom/ListingOutreachDialog';

type LeadStage = 'new_prospect' | 'listing_outreach' | 'negotiation' | 'closed';

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  lead_stage: string;
  last_interaction_at: string | null;
  profile_picture_url?: string | null;
  city?: string | null;
  interest_tag?: string | null;
};

const STAGE_COLUMNS: Array<{
  key: LeadStage;
  title: string;
  icon: typeof UserPlus;
  accent: string;
  legacyKeys: string[];
}> = [
  {
    key: 'new_prospect',
    title: 'New Prospect',
    icon: UserPlus,
    accent: 'text-primary',
    legacyKeys: ['new', 'lead', 'new_prospect'],
  },
  {
    key: 'listing_outreach',
    title: 'Listing Outreach',
    icon: Megaphone,
    accent: 'text-social-facebook',
    legacyKeys: ['contacted', 'outreach', 'listing_outreach', 'campaign'],
  },
  {
    key: 'negotiation',
    title: 'Negotiation',
    icon: Handshake,
    accent: 'text-warning',
    legacyKeys: ['negotiation', 'qualified', 'meeting'],
  },
  {
    key: 'closed',
    title: 'Closed',
    icon: CheckCircle2,
    accent: 'text-success',
    legacyKeys: ['closed', 'won', 'converted', 'lost'],
  },
];

function bucketFor(stage: string | null): LeadStage {
  const s = (stage || 'new').toLowerCase();
  for (const col of STAGE_COLUMNS) {
    if (col.legacyKeys.includes(s)) return col.key;
  }
  return 'new_prospect';
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'No interaction yet';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function DealRoom() {
  const queryClient = useQueryClient();
  const [activeProspect, setActiveProspect] = useState<Lead | null>(null);
  const [outreachProspectId, setOutreachProspectId] = useState<string | null>(null);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [smartReply, setSmartReply] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ['deal-room-prospects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, lead_stage, last_interaction_at, profile_picture_url, city, interest_tag')
        .eq('is_demo', false)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Lead[];
    },
  });

  const grouped = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {
      new_prospect: [],
      listing_outreach: [],
      negotiation: [],
      closed: [],
    };
    (leads || []).forEach((l) => {
      map[bucketFor(l.lead_stage)].push(l);
    });
    return map;
  }, [leads]);

  async function openSmartReply(prospect: Lead) {
    setActiveProspect(prospect);
    setSmartReply('');
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          mode: 'deal_room_reply',
          lead_id: prospect.id,
          prospect_name: prospect.full_name,
          context: `Prospect stage: ${prospect.lead_stage}. City: ${prospect.city || 'unknown'}. Interest: ${prospect.interest_tag || 'general'}.`,
        },
      });
      if (error) throw error;
      const reply = (data as any)?.reply || (data as any)?.message || (data as any)?.content || '';
      setSmartReply(reply || 'No suggestion available right now. Try again in a moment.');
    } catch (err: any) {
      console.error('Smart reply error', err);
      setSmartReply('');
      toast.error('Could not generate Smart Reply', { description: err?.message });
    } finally {
      setGenerating(false);
    }
  }

  async function sendReply() {
    if (!activeProspect || !smartReply.trim()) return;
    try {
      const { error } = await supabase.from('messages').insert({
        lead_id: activeProspect.id,
        direction: 'outbound',
        sender_type: 'agent',
        content: smartReply.trim(),
        channel: 'whatsapp',
        platform: 'whatsapp',
      });
      if (error) throw error;
      toast.success('Reply sent to Prospect');
      setActiveProspect(null);
      queryClient.invalidateQueries({ queryKey: ['deal-room-prospects'] });
    } catch (err: any) {
      toast.error('Failed to send reply', { description: err?.message });
    }
  }

  return (
    <div className="p-6 space-y-6" dir="ltr">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </span>
            Deal Room
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline view of every Prospect — drag intent into action.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {leads?.length ?? 0} Prospects
          </Badge>
          <Button
            onClick={() => {
              setOutreachProspectId(null);
              setOutreachOpen(true);
            }}
            className="gap-1.5"
          >
            <Megaphone className="h-4 w-4" />
            New Listing Outreach
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {STAGE_COLUMNS.map((col) => {
          const Icon = col.icon;
          const items = grouped[col.key];
          return (
            <section
              key={col.key}
              className="flex flex-col rounded-xl border bg-card/40 backdrop-blur-sm min-h-[60vh]"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', col.accent)} />
                  <h2 className="font-medium text-sm">{col.title}</h2>
                </div>
                <Badge variant="outline" className="text-xs font-normal">
                  {items.length}
                </Badge>
              </header>

              <ScrollArea className="flex-1 p-3">
                <div className="space-y-3">
                  {isLoading &&
                    Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-lg" />
                    ))}

                  {!isLoading && items.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8">
                      No Prospects in this stage
                    </div>
                  )}

                  {items.map((p) => (
                    <Card
                      key={p.id}
                      className="p-3 hover:shadow-md transition-shadow border bg-background"
                    >
                      <div className="flex items-start gap-3">
                        <VoterAvatar
                          fullName={p.full_name}
                          profilePictureUrl={p.profile_picture_url}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">
                            {p.full_name || 'Unnamed Prospect'}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Clock className="h-3 w-3" />
                            <span className="truncate">{timeAgo(p.last_interaction_at)}</span>
                          </div>
                          {p.city && (
                            <div className="text-xs text-muted-foreground/80 mt-0.5 truncate">
                              {p.city}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 text-xs"
                          onClick={() => openSmartReply(p)}
                        >
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Reply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 text-xs"
                          onClick={() => {
                            setOutreachProspectId(p.id);
                            setOutreachOpen(true);
                          }}
                        >
                          <Megaphone className="h-3.5 w-3.5 text-warning" />
                          Outreach
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </section>
          );
        })}
      </div>

      <Sheet open={!!activeProspect} onOpenChange={(o) => !o && setActiveProspect(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col" dir="ltr">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Smart Reply
            </SheetTitle>
            <SheetDescription>
              Suggested reply for{' '}
              <span className="font-medium text-foreground">
                {activeProspect?.full_name || 'this Prospect'}
              </span>
              , drafted in your authentic voice from the Strategy Bank.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 mt-4 space-y-3">
            {generating ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-9/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ) : (
              <textarea
                value={smartReply}
                onChange={(e) => setSmartReply(e.target.value)}
                rows={10}
                className="w-full rounded-md border bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Your Smart Reply will appear here..."
              />
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              disabled={generating}
              onClick={() => activeProspect && openSmartReply(activeProspect)}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Regenerate
            </Button>
            <Button
              className="flex-1"
              disabled={!smartReply.trim() || generating}
              onClick={sendReply}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Send
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ListingOutreachDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        defaultProspectId={outreachProspectId}
      />
    </div>
  );
}
