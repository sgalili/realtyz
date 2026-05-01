import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorBoundary from '@/components/ErrorBoundary';
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
  
  Database,
  PenLine,
  Pencil,
  Check,
  ShieldCheck,
  Home,
  Flame,
  ArrowDownUp,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ListingOutreachDialog } from '@/components/dealroom/ListingOutreachDialog';
import { ActionItemsPanel } from '@/components/dealroom/ActionItemsPanel';
import {
  PropertyMatchmakerDialog,
  PropertySnippet,
  type PropertyResult,
} from '@/components/dealroom/PropertyMatchmakerDialog';
import { AutomationActivityFeed } from '@/components/dealroom/AutomationActivityFeed';
import { CallHistoryList } from '@/components/dealroom/CallHistoryList';
import { PriorityScoreBadge } from '@/components/dealroom/PriorityScoreBadge';
import { DealRoomComments } from '@/components/dealroom/DealRoomComments';
import { OutcomePicker, OutcomeBadge } from '@/components/dealroom/OutcomePicker';
import { ClosingRoomDialog } from '@/components/dealroom/ClosingRoomDialog';
import { AiMessageFeedback } from '@/components/AiMessageFeedback';
import { ReferralButton } from '@/components/referrals/ReferralButton';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type LeadStage = 'new_lead' | 'listing_outreach' | 'negotiation' | 'awaiting_signature' | 'closed';

type ScoreComponents = {
  frequency?: number;
  sentiment?: number;
  response_speed?: number;
  property_interest?: number;
};

type DealType = 'sale' | 'rent';

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  lead_stage: string;
  last_interaction_at: string | null;
  profile_picture_url?: string | null;
  city?: string | null;
  interest_tag?: string | null;
  priority_score?: number | null;
  priority_score_components?: ScoreComponents | null;
  previous_priority_score?: number | null;
  assigned_to?: string | null;
  deal_type?: DealType | null;
  preferences?: Record<string, unknown> | null;
  interaction_outcome?: import('@/components/dealroom/OutcomePicker').InteractionOutcome | null;
};

type SortMode = 'recent' | 'priority';

// Stage columns are pipeline-specific. The KEY (lead_stage value) is shared so
// data lives in one column on the table; only the displayed TITLE differs per
// pipeline (e.g. "סגירה" for Sale vs "חתימת חוזה שכירות" for Rent).
type StageColumn = {
  key: LeadStage;
  title: string;
  icon: typeof UserPlus;
  accent: string;
  legacyKeys: string[];
};

const SALE_STAGE_COLUMNS: StageColumn[] = [
  { key: 'new_lead',       title: 'מתעניין חדש',          icon: UserPlus,      accent: 'text-primary',          legacyKeys: ['new', 'lead', 'new_lead'] },
  { key: 'listing_outreach',   title: 'שליחת נכסים למכירה',   icon: Megaphone,     accent: 'text-social-facebook',  legacyKeys: ['contacted', 'outreach', 'listing_outreach', 'campaign'] },
  { key: 'negotiation',        title: 'משא ומתן על מחיר',     icon: Handshake,     accent: 'text-warning',          legacyKeys: ['negotiation', 'qualified', 'meeting'] },
  { key: 'awaiting_signature', title: 'ממתין לחתימת זיכרון',  icon: PenLine,       accent: 'text-primary',          legacyKeys: ['awaiting_signature', 'signature_pending'] },
  { key: 'closed',             title: 'סגירה',                icon: CheckCircle2,  accent: 'text-success',          legacyKeys: ['closed', 'won', 'converted', 'lost'] },
];

const RENT_STAGE_COLUMNS: StageColumn[] = [
  { key: 'new_lead',       title: 'מתעניין חדש',           icon: UserPlus,      accent: 'text-primary',          legacyKeys: ['new', 'lead', 'new_lead'] },
  { key: 'listing_outreach',   title: 'שליחת נכסים להשכרה',    icon: Megaphone,     accent: 'text-social-facebook',  legacyKeys: ['contacted', 'outreach', 'listing_outreach', 'campaign'] },
  { key: 'negotiation',        title: 'תיאום צפייה / מו״מ',    icon: Handshake,     accent: 'text-warning',          legacyKeys: ['negotiation', 'qualified', 'meeting'] },
  { key: 'awaiting_signature', title: 'ממתין לחתימת חוזה שכירות', icon: PenLine,    accent: 'text-primary',          legacyKeys: ['awaiting_signature', 'signature_pending'] },
  { key: 'closed',             title: 'מאוכלס',                icon: CheckCircle2,  accent: 'text-success',          legacyKeys: ['closed', 'won', 'converted', 'lost'] },
];

function columnsFor(deal: DealType): StageColumn[] {
  return deal === 'rent' ? RENT_STAGE_COLUMNS : SALE_STAGE_COLUMNS;
}

const SHARED_LEGACY_KEYS = SALE_STAGE_COLUMNS;

function bucketFor(stage: string | null): LeadStage {
  const s = (stage || 'new').toLowerCase();
  for (const col of SHARED_LEGACY_KEYS) {
    if (col.legacyKeys.includes(s)) return col.key;
  }
  return 'new_lead';
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'אין אינטראקציה עדיין';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} ד׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} ש׳`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return `לפני ${months} חודשים`;
}

export default function DealRoom() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [outreachLeadId, setOutreachLeadId] = useState<string | null>(null);
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
  // Compliance signals returned by the ai-agent edge function for the current draft.
  const [factViolations, setFactViolations] = useState<Array<{ kind: string; value: string; reason: string }>>([]);
  const [escalation, setEscalation] = useState<{ category: string; severity: string; matched: string[] } | null>(null);
  // Smart Matchmaker — opens the Find Property overlay for a chosen lead
  const [matchmakerLead, setMatchmakerLead] = useState<Lead | null>(null);
  // When the Smart Reply was pre-filled by the matchmaker we keep the snippet
  // so the agent sees the property card pinned to the chat preview.
  const [pinnedProperty, setPinnedProperty] = useState<PropertyResult | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  // Hard pipeline separation — only one of {sale, rent} is visible at a time.
  // Persists in the URL so deep links + refresh keep the agent on the right view.
  const initialDealType: DealType =
    (searchParams.get('pipeline') as DealType) === 'rent' ? 'rent' : 'sale';
  const [activeDealType, setActiveDealType] = useState<DealType>(initialDealType);
  const { canAssignLeads, isJuniorOnly } = useUserRole();

  // Team members available for delegation (Assign To dropdown).
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['deal-room-team-members'],
    enabled: canAssignLeads,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['managing_broker', 'lead_agent', 'agent', 'assistant', 'junior_agent']);
      // Deduplicate by user_id (a user can hold several roles).
      const seen = new Set<string>();
      return (data || []).filter((r) => {
        if (seen.has(r.user_id)) return false;
        seen.add(r.user_id);
        return true;
      }) as Array<{ user_id: string; role: string }>;
    },
    staleTime: 60_000,
  });

  async function assignLead(leadId: string, userId: string | null) {
    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: userId })
      .eq('id', leadId);
    if (error) {
      toast.error('לא ניתן להקצות את המתעניין', { description: error.message });
      return;
    }
    toast.success(userId ? 'המתעניין הוקצה' : 'ההקצאה בוטלה');
    queryClient.invalidateQueries({ queryKey: ['deal-room-leads'] });
  }
  const [recomputing, setRecomputing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function importHomelyLeads() {
    if (importing) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('homely-leads', {
        body: {},
      });
      if (error) throw error;
      const n = (data as any)?.imported ?? 0;
      const src = (data as any)?.source === 'homely' ? 'Homely' : 'מאגר דמו';
      toast.success(`Imported ${n} new leads`, {
        description: `מקור: ${src}`,
      });
      queryClient.invalidateQueries({ queryKey: ['deal-room-leads'] });
    } catch (err: any) {
      toast.error('ייבוא המתעניינים נכשל', { description: err?.message });
    } finally {
      setImporting(false);
    }
  }

  const { data: leads, isLoading } = useQuery({
    queryKey: ['deal-room-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, lead_stage, last_interaction_at, profile_picture_url, city, interest_tag, priority_score, priority_score_components, previous_priority_score, assigned_to, deal_type, preferences, interaction_outcome')
        .eq('is_demo', false)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Lead[];
    },
  });

  // Resolve a lead's pipeline. Prefer the new top-level deal_type column;
  // fall back to legacy preferences.listing_type for older rows.
  function resolveDealType(l: Lead): DealType {
    const dt = (l.deal_type as DealType | null | undefined)
      ?? (l.preferences as any)?.listing_type;
    return dt === 'rent' ? 'rent' : 'sale';
  }

  const visibleLeads = useMemo(
    () => (leads || []).filter((l) => resolveDealType(l) === activeDealType),
    [leads, activeDealType],
  );

  const saleCount = useMemo(
    () => (leads || []).filter((l) => resolveDealType(l) === 'sale').length,
    [leads],
  );
  const rentCount = useMemo(
    () => (leads || []).filter((l) => resolveDealType(l) === 'rent').length,
    [leads],
  );

  const stageColumns = useMemo(() => columnsFor(activeDealType), [activeDealType]);

  const grouped = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {
      new_lead: [],
      listing_outreach: [],
      negotiation: [],
      awaiting_signature: [],
      closed: [],
    };
    visibleLeads.forEach((l) => {
      map[bucketFor(l.lead_stage)].push(l);
    });
    if (sortMode === 'priority') {
      (Object.keys(map) as LeadStage[]).forEach((k) => {
        map[k].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
      });
    }
    return map;
  }, [visibleLeads, sortMode]);

  async function recomputeAllScores() {
    if (recomputing) return;
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke('compute-lead-score', {
        body: { recompute_all: true },
      });
      if (error) throw error;
      const n = (data as any)?.processed ?? 0;
      toast.success(`חושבו מחדש ${n} ציוני מתעניין`);
      queryClient.invalidateQueries({ queryKey: ['deal-room-leads'] });
    } catch (err: any) {
      toast.error('לא ניתן לחשב מחדש את הציונים', { description: err?.message });
    } finally {
      setRecomputing(false);
    }
  }

  // Smart Notification deep link: ?leadId=<uuid> opens that lead's Smart Reply sheet.
  useEffect(() => {
    const leadId = searchParams.get('leadId');
    if (!leadId || !leads || activeLead) return;
    const target = leads.find((l) => l.id === leadId);
    if (target) {
      void openSmartReply(target);
      // Clean the URL so refresh doesn't keep reopening.
      const next = new URLSearchParams(searchParams);
      next.delete('leadId');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, searchParams]);

  async function openSmartReply(lead: Lead) {
    setActiveSuggestionId(null);
    setActiveLead(lead);
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
          lead_id: lead.id,
          lead_name: lead.full_name,
          context: `Lead stage: ${lead.lead_stage}. City: ${lead.city || 'unknown'}. Interest: ${lead.interest_tag || 'general'}.`,
        },
      });
      if (error) throw error;
      const reply = (data as any)?.reply || (data as any)?.message || (data as any)?.content || '';
      setSmartReply(reply || 'אין הצעה זמינה כרגע. נסה שוב בעוד רגע.');
      setFactViolations(((data as any)?.fact_violations as any[]) || []);
      setEscalation(((data as any)?.escalation as any) || null);
    } catch (err: any) {
      console.error('Smart reply error', err);
      setSmartReply('');
      toast.error('לא ניתן ליצור תשובה חכמה', { description: err?.message });
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
      toast.error('המתעניין אינו זמין עבור הצעה זו');
      return;
    }
    setActiveSuggestionId(suggestion.id);
    setActiveLead(suggestion.lead as Lead);
    setSmartReply(suggestion.draft_message);
    setDraftMode('review');
    setGenerating(false);
    setGenPhase('idle');
  }

  // Smart Matchmaker callback: AI drafted a personalized share message for the
  // selected property → pre-fill the Smart Reply sheet for the same lead so
  // the agent can review/edit and Approve & Send through the existing flow.
  function handleShareDraft({ draft, property }: { draft: string; property: PropertyResult }) {
    if (!matchmakerLead) return;
    setActiveSuggestionId(null);
    setFactViolations([]);
    setEscalation(null);
    setActiveLead(matchmakerLead);
    setSmartReply(draft);
    setPinnedProperty(property);
    setDraftMode('review');
    setGenerating(false);
    setGenPhase('idle');
  }

  // Human-in-the-loop: only fires WhatsApp after the Agent explicitly approves the draft.
  async function approveAndSend() {
    if (!activeLead || !smartReply.trim() || sending) return;
    setSending(true);
    try {
      // Route through the unified send-whatsapp gateway (WBA → GreenAPI fallback).
      // The gateway resolves the recipient phone from lead_id and inserts the
      // outbound row into `messages` on success — that becomes the Deal Room history entry.
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          lead_id: activeLead.id,
          body: smartReply.trim(),
        },
      });
      if (error) throw error;
      const ok = (data as any)?.ok ?? (data as any)?.success ?? true;
      if (!ok) {
        const reason = (data as any)?.error || 'שער ה-WhatsApp דחה את ההודעה';
        throw new Error(reason);
      }
      toast.success('התשובה אושרה ונשלחה', {
        description: `WhatsApp נמסר ל-${activeLead.full_name || 'המתעניין'}`,
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
      setActiveLead(null);
      setPinnedProperty(null);
      // Refresh both the Kanban (last_interaction_at) and any open chat history.
      queryClient.invalidateQueries({ queryKey: ['deal-room-leads'] });
      queryClient.invalidateQueries({ queryKey: ['messages', activeLead.id] });
    } catch (err: any) {
      toast.error('שליחת התשובה נכשלה', { description: err?.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            עסקאות
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            תצוגת ניהול מתעניינים של כל המתעניינים — גרור כוונה לפעולה.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <Badge variant="secondary" className="text-sm">
            {visibleLeads.length} {activeDealType === 'rent' ? 'מתעניינים בהשכרה' : 'מתעניינים במכירה'}
          </Badge>
          <Button
            variant={sortMode === 'priority' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortMode((m) => (m === 'priority' ? 'recent' : 'priority'))}
            className="gap-1.5 h-11"
            title="מיון לפי ציון מתעניין חזוי"
          >
            {sortMode === 'priority' ? (
              <Flame className="h-4 w-4" />
            ) : (
              <ArrowDownUp className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {sortMode === 'priority' ? 'ממויין לפי עדיפות' : 'מיין לפי עדיפות'}
            </span>
            <span className="sm:hidden">
              {sortMode === 'priority' ? 'עדיפות' : 'מיין'}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={recomputeAllScores}
            disabled={recomputing}
            className="gap-1.5 h-11"
            title="חשב מחדש את כל ציוני המתעניינים"
          >
            <RefreshCw className={cn('h-4 w-4', recomputing && 'animate-spin')} />
            <span className="hidden md:inline">חשב מחדש ציונים</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={importHomelyLeads}
            disabled={importing}
            className="gap-1.5 h-11"
            title="ייבוא מתעניינים חדשים מ-Homely"
          >
            <UserPlus className={cn('h-4 w-4', importing && 'animate-pulse')} />
            <span className="hidden md:inline">{importing ? 'מייבא...' : 'ייבוא מתעניינים'}</span>
          </Button>
          <Button
            onClick={() => {
              setOutreachLeadId(null);
              setOutreachOpen(true);
            }}
            className="gap-1.5 h-11 flex-1 sm:flex-none"
          >
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">פנייה אקטיבית חדשה</span>
            <span className="sm:hidden">פנייה חדשה</span>
          </Button>
        </div>
      </header>

      <ActionItemsPanel onUseDraft={openFromSuggestion} />

      {/* Hard pipeline separation: Sale (מכירה) vs Rent (השכרה) — only one
          pipeline is visible at a time. The selected pipeline is mirrored in
          the URL so deep links + reloads keep the agent on the same view. */}
      <Tabs
        value={activeDealType}
        onValueChange={(v) => {
          const next = (v === 'rent' ? 'rent' : 'sale') as DealType;
          setActiveDealType(next);
          const params = new URLSearchParams(searchParams);
          params.set('pipeline', next);
          setSearchParams(params, { replace: true });
        }}
        dir="rtl"
      >
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="sale" className="gap-2">
            מכירה
            <Badge variant="secondary" className="text-[10px] font-normal">{saleCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rent" className="gap-2">
            השכרה
            <Badge variant="secondary" className="text-[10px] font-normal">{rentCount}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <ErrorBoundary source="DealRoom.Grid">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stageColumns.map((col) => {
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
                      אין מתעניינים בשלב זה
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
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm truncate min-w-0 flex-1">
                              {p.full_name || 'מתעניין ללא שם'}
                            </div>
                            <PriorityScoreBadge
                              score={p.priority_score ?? 0}
                              components={p.priority_score_components}
                              previousScore={p.previous_priority_score ?? undefined}
                              className="shrink-0"
                            />
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
                          {p.interaction_outcome && (
                            <div className="mt-1.5">
                              <OutcomeBadge value={p.interaction_outcome} className="text-[10px] py-0" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-11 sm:h-9 text-xs"
                          onClick={() => openSmartReply(p)}
                        >
                          <Sparkles className="h-4 w-4 text-primary" />
                          תשובה
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-11 sm:h-9 text-xs"
                          onClick={() => setMatchmakerLead(p)}
                        >
                          <Home className="h-4 w-4 text-success" />
                          <span className="hidden xs:inline sm:inline">מצא נכס</span>
                          <span className="xs:hidden sm:hidden">מצא</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-11 sm:h-9 text-xs"
                          onClick={() => {
                            setOutreachLeadId(p.id);
                            setOutreachOpen(true);
                          }}
                        >
                          <Megaphone className="h-4 w-4 text-warning" />
                          פנייה
                        </Button>
                        <ReferralButton
                          subject={{
                            kind: 'lead',
                            id: p.id,
                            label: `${p.full_name ?? 'מתעניין'}${p.city ? ' · ' + p.city : ''}`,
                          }}
                          className="h-11 sm:h-9 text-xs"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground shrink-0">תוצאה</span>
                        <OutcomePicker
                          leadId={p.id}
                          value={p.interaction_outcome ?? null}
                        />
                      </div>
                      {canAssignLeads && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground shrink-0">הקצה ל</span>
                          <Select
                            value={p.assigned_to ?? '__unassigned__'}
                            onValueChange={(v) =>
                              assignLead(p.id, v === '__unassigned__' ? null : v)
                            }
                          >
                            <SelectTrigger className="h-7 text-[11px]">
                              <SelectValue placeholder="לא מוקצה" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned__">לא מוקצה</SelectItem>
                              {teamMembers.map((m) => (
                                <SelectItem key={m.user_id} value={m.user_id}>
                                  {m.user_id.slice(0, 8)}… · {m.role.replace('_', ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </section>
          );
        })}
      </div>
      </ErrorBoundary>

      <Sheet
        open={!!activeLead}
        onOpenChange={(o) => {
          if (!o) {
            setActiveLead(null);
            setActiveSuggestionId(null);
            setPinnedProperty(null);
          }
        }}
      >
        <SheetContent side="left" className="w-full sm:max-w-md flex flex-col p-4 sm:p-6 pb-[max(env(safe-area-inset-bottom),1rem)]" dir="rtl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              תשובה חכמה
            </SheetTitle>
            <SheetDescription>
              תשובה מוצעת עבור{' '}
              <span className="font-medium text-foreground">
                {activeLead?.full_name || 'מתעניין זה'}
              </span>
              , נכתבה בקול האותנטי שלך מתוך מאגר האסטרטגיה.
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
                      <span>מחפש במאגר האסטרטגיה…</span>
                    </>
                  ) : (
                    <>
                      <PenLine className="h-4 w-4 text-primary animate-pulse" />
                      <span>מנסח תשובה בסגנון שלך…</span>
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
                {escalation && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    🚨 התראת הסלמה ({escalation.severity}) — קטגוריה: <strong>{escalation.category}</strong>
                    {escalation.matched?.length ? <> · מילות מפתח: {escalation.matched.join(', ')}</> : null}
                    <div className="mt-0.5 text-[11px] opacity-80">נשלחה התראת WhatsApp לטלפון שלך. השתלט ידנית לפני השליחה.</div>
                  </div>
                )}
                {factViolations.length > 0 && (
                  <div className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
                    ⚠️ בדיקת עובדות נכשלה — אמת מול נכסי Homely:
                    <ul className="list-disc me-4 mt-1 space-y-0.5">
                      {factViolations.map((v, i) => (<li key={i}><strong>{v.kind}:</strong> {v.value} — {v.reason}</li>))}
                    </ul>
                  </div>
                )}
                {pinnedProperty && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Home className="h-3 w-3" /> פרטי נכס
                    </div>
                    <PropertySnippet property={pinnedProperty} />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-primary/30 bg-primary/5 text-primary font-normal"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {activeSuggestionId ? 'הצעת AI — ממתינה לאישור' : 'טיוטת AI — ממתינה לאישור'}
                  </Badge>
                  {draftMode === 'editing' && (
                    <span className="text-[11px] text-muted-foreground">עריכה</span>
                  )}
                </div>
                {draftMode === 'review' ? (
                  <div
                    className="w-full rounded-md border-2 border-dashed border-primary/30 bg-primary/[0.03] p-3 text-sm leading-relaxed whitespace-pre-wrap min-h-[14rem]"
                    aria-label="טיוטת AI לתשובה, לקריאה בלבד עד עריכה"
                  >
                    {smartReply || (
                      <span className="text-muted-foreground italic">
                        התשובה החכמה שלך תופיע כאן…
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
                    placeholder="ערוך את התשובה שלך…"
                  />
                )}
                <p className="text-[11px] text-muted-foreground leading-snug">
                  שום דבר לא נשלח למתעניין עד שתלחץ <span className="font-medium text-foreground">אשר ושלח</span>.
                </p>
                {smartReply.trim() && (
                  <AiMessageFeedback
                    aiMessage={smartReply}
                    surface="deal_room"
                    leadId={activeLead?.id ?? null}
                    suggestionId={activeSuggestionId ?? null}
                  />
                )}
              </div>
            )}

            {activeLead && (
              <CallHistoryList leadId={activeLead.id} limit={5} />
            )}

            {activeLead && (
              <AutomationActivityFeed leadId={activeLead.id} limit={10} />
            )}

            {activeLead && (
              <DealRoomComments leadId={activeLead.id} />
            )}
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t">
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-12 text-sm"
                disabled={generating || sending || !smartReply.trim()}
                onClick={() => setDraftMode((m) => (m === 'editing' ? 'review' : 'editing'))}
              >
                {draftMode === 'editing' ? (
                  <>
                    <Check className="h-4 w-4 ms-1.5" />
                    סיום
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4 ms-1.5" />
                    ערוך
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="h-12 text-sm"
                disabled={generating || sending}
                onClick={() => activeLead && openSmartReply(activeLead)}
              >
                <Sparkles className="h-4 w-4 ms-1.5" />
                צור מחדש
              </Button>
              <Button
                variant="outline"
                className="h-12 text-sm"
                disabled={generating || sending || !activeLead}
                onClick={() => activeLead && setMatchmakerLead(activeLead)}
              >
                <Home className="h-4 w-4 ms-1.5 text-success" />
                מצא
              </Button>
            </div>
            <Button
              className="w-full h-14 text-base"
              disabled={!smartReply.trim() || generating || sending}
              onClick={approveAndSend}
            >
              {sending ? (
                <>
                  <Send className="h-5 w-5 ms-1.5 animate-pulse" />
                  שולח דרך WhatsApp…
                </>
              ) : (
                <>
                  <Send className="h-5 w-5 ms-1.5" />
                  אשר ושלח
                </>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ListingOutreachDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        defaultLeadId={outreachLeadId}
      />

      <PropertyMatchmakerDialog
        open={!!matchmakerLead}
        onOpenChange={(o) => { if (!o) setMatchmakerLead(null); }}
        lead={matchmakerLead}
        onShareDraft={handleShareDraft}
      />
    </div>
  );
}
