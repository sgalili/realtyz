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
  Database,
  PenLine,
  Pencil,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ListingOutreachDialog } from '@/components/dealroom/ListingOutreachDialog';
import { ActionItemsPanel } from '@/components/dealroom/ActionItemsPanel';

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
  const [genPhase, setGenPhase] = useState<'idle' | 'searching' | 'drafting'>('idle');
  // Human-in-the-loop draft lifecycle: review (read-only AI draft) → editing → sending → sent
  const [draftMode, setDraftMode] = useState<'review' | 'editing'>('review');
  const [sending, setSending] = useState(false);
  // When the Smart Reply sheet was opened from an Action Item, we keep the suggestion id
  // so we can flip it to `used` after Approve & Send and badge the sheet appropriately.
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);

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
    setActiveSuggestionId(null);
    setActiveProspect(prospect);
    setSmartReply('');
    setDraftMode('review');
    setGenerating(true);
    setGenPhase('searching');
    // Flip the status to "drafting" shortly after kick-off so the Agent sees both phases
    // even on fast responses. The edge function performs the vector search first, then drafts.
    const phaseTimer = window.setTimeout(() => setGenPhase('drafting'), 900);
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
      window.clearTimeout(phaseTimer);
      setGenerating(false);
      setGenPhase('idle');
    }
  }

  // One-click from an Action Item card: open the Smart Reply sheet pre-filled with the
  // suggested draft so the Agent can review/edit and Approve & Send. We skip the AI call
  // because the suggestion already contains a draft (templated or auto-drafted).
  function openFromSuggestion(suggestion: {
    id: string;
    draft_message: string;
    lead?: any;
  }) {
    if (!suggestion.lead) {
      toast.error('Prospect not available for this suggestion');
      return;
    }
    setActiveSuggestionId(suggestion.id);
    setActiveProspect(suggestion.lead as Lead);
    setSmartReply(suggestion.draft_message);
    setDraftMode('review');
    setGenerating(false);
    setGenPhase('idle');
  }

  // Human-in-the-loop: only fires WhatsApp after the Agent explicitly approves the draft.
  async function approveAndSend() {
    if (!activeProspect || !smartReply.trim() || sending) return;
    setSending(true);
    try {
      // Route through the unified send-whatsapp gateway (WBA → GreenAPI fallback).
      // The gateway resolves the recipient phone from lead_id and inserts the
      // outbound row into `messages` on success — that becomes the Deal Room history entry.
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          lead_id: activeProspect.id,
          body: smartReply.trim(),
        },
      });
      if (error) throw error;
      const ok = (data as any)?.ok ?? (data as any)?.success ?? true;
      if (!ok) {
        const reason = (data as any)?.error || 'WhatsApp gateway rejected the message';
        throw new Error(reason);
      }
      toast.success('Reply approved & sent', {
        description: `WhatsApp delivered to ${activeProspect.full_name || 'Prospect'}`,
      });
      // If this draft came from an Action Item, mark the suggestion as used so it
      // disappears from the queue and we don't suggest the same thing again.
      if (activeSuggestionId) {
        await supabase
          .from('outreach_suggestions')
          .update({ status: 'used', used_at: new Date().toISOString() })
          .eq('id', activeSuggestionId);
        queryClient.invalidateQueries({ queryKey: ['outreach-suggestions'] });
      }
      setActiveSuggestionId(null);
      setActiveProspect(null);
      // Refresh both the Kanban (last_interaction_at) and any open chat history.
      queryClient.invalidateQueries({ queryKey: ['deal-room-prospects'] });
      queryClient.invalidateQueries({ queryKey: ['messages', activeProspect.id] });
    } catch (err: any) {
      toast.error('Failed to send reply', { description: err?.message });
    } finally {
      setSending(false);
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

      <ActionItemsPanel onUseDraft={openFromSuggestion} />

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

          <div className="flex-1 mt-4 space-y-3 overflow-y-auto">
            {generating ? (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-2.5 rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {genPhase === 'searching' ? (
                    <>
                      <Database className="h-4 w-4 text-primary animate-pulse" />
                      <span>Searching Strategy Bank…</span>
                    </>
                  ) : (
                    <>
                      <PenLine className="h-4 w-4 text-primary animate-pulse" />
                      <span>Drafting reply in your voice…</span>
                    </>
                  )}
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-9/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-primary/30 bg-primary/5 text-primary font-normal"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    AI Draft — awaiting approval
                  </Badge>
                  {draftMode === 'editing' && (
                    <span className="text-[11px] text-muted-foreground">Editing</span>
                  )}
                </div>
                {draftMode === 'review' ? (
                  <div
                    className="w-full rounded-md border-2 border-dashed border-primary/30 bg-primary/[0.03] p-3 text-sm leading-relaxed whitespace-pre-wrap min-h-[14rem]"
                    aria-label="AI-generated draft reply, read-only until edited"
                  >
                    {smartReply || (
                      <span className="text-muted-foreground italic">
                        Your Smart Reply will appear here…
                      </span>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={smartReply}
                    onChange={(e) => setSmartReply(e.target.value)}
                    rows={10}
                    autoFocus
                    className="w-full rounded-md border-2 border-primary/40 bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="Edit your reply…"
                  />
                )}
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Nothing is sent to the Prospect until you click <span className="font-medium text-foreground">Approve &amp; Send</span>.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={generating || sending || !smartReply.trim()}
                onClick={() => setDraftMode((m) => (m === 'editing' ? 'review' : 'editing'))}
              >
                {draftMode === 'editing' ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Done editing
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={generating || sending}
                onClick={() => activeProspect && openSmartReply(activeProspect)}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Regenerate
              </Button>
            </div>
            <Button
              className="w-full"
              disabled={!smartReply.trim() || generating || sending}
              onClick={approveAndSend}
            >
              {sending ? (
                <>
                  <Send className="h-4 w-4 mr-1.5 animate-pulse" />
                  Sending via WhatsApp…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  Approve &amp; Send
                </>
              )}
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
