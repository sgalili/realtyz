import { useEffect, useState, useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, User, Search, Hand, Send, Tag, MapPin, Hash, Zap, ChevronUp, ArrowRight, Instagram, Facebook, MessageCircle, Twitter, Youtube, Mail, Phone, Globe, ThumbsUp, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import VoterAvatar from '@/components/VoterAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { sendToN8n } from '@/lib/n8nService';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoTicker } from '@/hooks/useDemoTicker';
import { DEMO_LIVE_ACTIONS, DEMO_MESSAGES, DEMO_VOTERS } from '@/lib/demoData';
import { motion, AnimatePresence } from 'framer-motion';

interface VoterWithLastMsg {
  id: string;
  full_name: string | null;
  city: string | null;
  profile_picture_url: string | null;
  last_content: string;
  last_at: string;
}

const CircularScore = ({ score }: { score: number }) => {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? 'hsl(var(--primary))' : score >= 30 ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';
  return (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
        <circle cx="36" cy="36" r={radius} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
};

const statusLabels: Record<string, { label: string; className: string }> = {
  supporter: { label: 'תומך', className: 'bg-primary/10 text-primary border-primary/25' },
  active: { label: 'פעיל', className: 'bg-primary/15 text-primary border-primary/30' },
  lead: { label: 'מתלבט', className: 'bg-accent/15 text-accent-foreground border-accent/30' },
  inactive: { label: 'לא פעיל', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  contacted: { label: 'נוצר קשר', className: 'bg-muted text-muted-foreground border-border' },
};

const CHAT_PAGE_SIZE = 20;

// TikTok brand SVG (Lucide doesn't ship one)
const TikTokIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.83a8.16 8.16 0 0 0 4.77 1.52V6.91a4.85 4.85 0 0 1-1.84-.22z"/>
  </svg>
);

// Platform palette - every card gets one (deterministic by lead id) for a healthy mix.
const PLATFORM_OPTIONS = [
  { key: 'instagram', node: <Instagram className="h-4 w-4 shrink-0 mt-0.5 text-social-instagram" /> },
  { key: 'facebook', node: <Facebook className="h-4 w-4 shrink-0 mt-0.5 text-social-facebook" /> },
  { key: 'whatsapp', node: <MessageCircle className="h-4 w-4 shrink-0 mt-0.5 text-social-whatsapp" /> },
  { key: 'twitter', node: <Twitter className="h-4 w-4 shrink-0 mt-0.5 text-social-telegram" /> },
  { key: 'youtube', node: <Youtube className="h-4 w-4 shrink-0 mt-0.5 text-social-email" /> },
  { key: 'tiktok', node: <TikTokIcon className="h-4 w-4 shrink-0 mt-0.5 text-social-tiktok" /> },
  { key: 'email', node: <Mail className="h-4 w-4 shrink-0 mt-0.5 text-primary" /> },
  { key: 'phone', node: <Phone className="h-4 w-4 shrink-0 mt-0.5 text-primary" /> },
];

const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// Detects channel/topic keyword in content; falls back to a deterministic platform per lead.
const ContentIcon = ({ text, voterId }: { text: string; voterId?: string }) => {
  const t = (text || '').toLowerCase();
  if (t.includes('טיקטוק') || t.includes('tiktok')) return <TikTokIcon className="h-4 w-4 shrink-0 mt-0.5 text-foreground" />;
  if (t.includes('אינסטגרם') || t.includes('instagram')) return <Instagram className="h-4 w-4 shrink-0 mt-0.5 text-social-instagram" />;
  if (t.includes('פייסבוק') || t.includes('facebook')) return <Facebook className="h-4 w-4 shrink-0 mt-0.5 text-social-facebook" />;
  if (t.includes('וואטסאפ') || t.includes("ווצאפ") || t.includes('whatsapp')) return <MessageCircle className="h-4 w-4 shrink-0 mt-0.5 text-social-whatsapp" />;
  if (t.includes('טוויטר') || t.includes('twitter') || t.includes('איקס')) return <Twitter className="h-4 w-4 shrink-0 mt-0.5 text-social-telegram" />;
  if (t.includes('יוטיוב') || t.includes('youtube')) return <Youtube className="h-4 w-4 shrink-0 mt-0.5 text-social-email" />;
  if (t.includes('מייל') || t.includes('אימייל') || t.includes('email')) return <Mail className="h-4 w-4 shrink-0 mt-0.5 text-primary" />;
  if (t.includes('טלפון') || t.includes('שיחה') || t.includes('sms') || t.includes('סמס')) return <Phone className="h-4 w-4 shrink-0 mt-0.5 text-primary" />;
  if (t.includes('משבר') || t.includes('שלילי') || t.includes('כועס')) return <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />;
  if (t.includes('ai') || t.includes('בינה') || t.includes('אוטומטי')) return <Bot className="h-4 w-4 shrink-0 mt-0.5 text-brand-blue" />;
  // Fallback: deterministic platform per lead so every card shows an icon and the list looks like a mix.
  const idx = hashString(voterId || text || 'x') % PLATFORM_OPTIONS.length;
  return PLATFORM_OPTIONS[idx].node;
};

const LiveConversations = () => {
  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [takeoverMode, setTakeoverMode] = useState(false);
  const [manualMsg, setManualMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [threadExpanded, setThreadExpanded] = useState(false);
  const { isDemoMode } = useDemoMode();
  const demoTicker = useDemoTicker();

  // Leads who have chat_history entries
  const { data: voterList } = useQuery({
    queryKey: ['live-conv-leads'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { data: chats } = await supabase
        .from('chat_history')
        .select('lead_id, content, created_at')
        .not('lead_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!chats || chats.length === 0) return [];

      const latest = new Map<string, { content: string; created_at: string }>();
      for (const c of chats) {
        if (c.lead_id && !latest.has(c.lead_id)) {
          latest.set(c.lead_id, { content: c.content ?? '', created_at: c.created_at ?? '' });
        }
      }

      const voterIds = [...latest.keys()];
      const { data: voters } = await supabase
        .from('leads')
        .select('id, full_name, city, profile_picture_url')
        .in('id', voterIds);

      const voterMap = new Map((voters ?? []).map((v) => [v.id, v]));

      const result: VoterWithLastMsg[] = voterIds.map((vid) => {
        const v = voterMap.get(vid);
        const l = latest.get(vid)!;
        return {
          id: vid,
          full_name: v?.full_name ?? null,
          city: v?.city ?? null,
          profile_picture_url: v?.profile_picture_url ?? null,
          last_content: l.content,
          last_at: l.created_at,
        };
      });

      result.sort((a, b) => (b.last_at > a.last_at ? 1 : -1));
      return result;
    },
    refetchInterval: 15_000,
  });

  // Paginated thread - loads last 20, with Load More
  const {
    data: threadPages,
    fetchNextPage: fetchOlderMessages,
    hasNextPage: hasOlderMessages,
    isFetchingNextPage: loadingOlder,
  } = useInfiniteQuery({
    queryKey: ['live-conv-thread', selectedVoterId],
    enabled: !!selectedVoterId && !isDemoMode,
    queryFn: async ({ pageParam = 0 }) => {
      const { data, count } = await supabase
        .from('chat_history')
        .select('*', { count: 'exact' })
        .eq('lead_id', selectedVoterId!)
        .order('created_at', { ascending: false })
        .range(pageParam * CHAT_PAGE_SIZE, (pageParam + 1) * CHAT_PAGE_SIZE - 1);
      return { rows: data ?? [], total: count ?? 0, page: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.page + 1;
      return next * CHAT_PAGE_SIZE < lastPage.total ? next : undefined;
    },
    staleTime: 30_000,
  });

  // Flatten and reverse to chronological order. While a card is open in demo mode,
  // freeze the thread snapshot (don't append new live messages) to prevent jumps.
  const thread = useMemo(() => {
    if (isDemoMode && selectedVoterId) {
      const base = DEMO_MESSAGES.filter((msg) => msg.lead_id === selectedVoterId).slice(-18);
      return base;
    }
    const all = threadPages?.pages.flatMap(p => p.rows) ?? [];
    return [...all].reverse();
  }, [isDemoMode, selectedVoterId, threadPages]);

  // Full lead profile
  const { data: voterProfile } = useQuery({
    queryKey: ['live-conv-lead-profile', selectedVoterId],
    enabled: !!selectedVoterId && !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('id', selectedVoterId!)
        .single();
      return data;
    },
  });

  // Demo: maintain a stable list, prepend a NEW unique lead every 3s
  const VISIBLE_COUNT = 24;
  const [demoVoterList, setDemoVoterList] = useState<Array<{
    id: string;
    full_name: string | null;
    city: string | null;
    profile_picture_url: string | null;
    last_content: string;
    last_at: string;
  }>>([]);

  // Initialize the visible list once when entering demo mode
  useEffect(() => {
    if (!isDemoMode) {
      setDemoVoterList([]);
      return;
    }
    setDemoVoterList((prev) => {
      if (prev.length > 0) return prev;
      return DEMO_VOTERS.slice(0, VISIBLE_COUNT).map((voter, index) => {
        const msgs = DEMO_MESSAGES.filter((msg) => msg.lead_id === voter.id);
        const last = msgs[msgs.length - 1];
        return {
          id: voter.id,
          full_name: voter.full_name,
          city: voter.city,
          profile_picture_url: voter.profile_picture_url,
          last_content: last?.content ?? '',
          last_at: new Date(Date.now() - index * 28_000).toISOString(),
        };
      });
    });
  }, [isDemoMode]);

  // Every 3s, prepend a NEW unique lead not already in the visible list.
  // Pause completely when a lead card is expanded.
  useEffect(() => {
    if (!isDemoMode) return;
    if (selectedVoterId) return; // freeze additions while a card is expanded
    let actionIndex = 0;
    const interval = setInterval(() => {
      setDemoVoterList((prev) => {
        const visibleIds = new Set(prev.map((v) => v.id));
        const candidates = DEMO_VOTERS.filter((v) => !visibleIds.has(v.id));
        if (candidates.length === 0) return prev;
        const next = candidates[Math.floor(Math.random() * candidates.length)];
        actionIndex = (actionIndex + 1) % DEMO_LIVE_ACTIONS.length;
        const newCard = {
          id: next.id,
          full_name: next.full_name,
          city: next.city,
          profile_picture_url: next.profile_picture_url,
          last_content: DEMO_LIVE_ACTIONS[actionIndex],
          last_at: new Date().toISOString(),
        };
        return [newCard, ...prev].slice(0, VISIBLE_COUNT);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isDemoMode, selectedVoterId]);

  const activeVoterList = isDemoMode ? demoVoterList : (voterList ?? []);
  const selectedVoter = activeVoterList.find((v) => v.id === selectedVoterId);
  const activeVoterProfile = isDemoMode
    ? DEMO_VOTERS.find((v) => v.id === selectedVoterId)
    : voterProfile;

  const filtered = activeVoterList.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (v.full_name?.toLowerCase().includes(q)) || (v.city?.toLowerCase().includes(q));
  });

  const handleSendManual = async () => {
    if (isDemoMode) {
      toast.info('במצב הדגמה מוצגות פעילויות חיות בלבד');
      return;
    }
    if (!manualMsg.trim() || !selectedVoterId || !voterProfile) return;
    setSending(true);
    try {
      await sendToN8n('message_sent', {
        lead_id: selectedVoterId,
        phone_number: voterProfile.phone_number,
        full_name: voterProfile.full_name,
        message: manualMsg.trim(),
      });
      toast.success('ההודעה נשלחה לעיבוד');
      setManualMsg('');
      setTakeoverMode(false);
    } catch {
      toast.error('שגיאה בשליחת ההודעה');
    } finally {
      setSending(false);
    }
  };

  const status = statusLabels[(activeVoterProfile as any)?.status ?? 'lead'] ?? statusLabels.lead;
  const liveAction = DEMO_LIVE_ACTIONS[demoTicker.sentBonus % DEMO_LIVE_ACTIONS.length];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">שיחות חיות</h1>
        <p className="text-muted-foreground text-sm">צפייה בשיחות AI עם מתעניינים בזמן אמת</p>
      </div>

      {isDemoMode && (
        <div className="mt-10 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          <span className="truncate font-bold">{liveAction}</span>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-primary/15 bg-card shadow-sm">
        {/* Search */}
        <div className="p-3 border-b border-primary/10 bg-card/80">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש מתעניין..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 bg-background border-primary/15 text-sm h-9"
            />
          </div>
        </div>

        {/* Lead cards (accordion) */}
        <ScrollArea className="h-[calc(100svh-280px)]">
          {(!filtered || filtered.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">אין שיחות עדיין</p>
          )}
          <AnimatePresence initial={false}>
            {filtered?.map((voter) => {
              const isOpen = selectedVoterId === voter.id;
              return (
                <motion.div
                  key={voter.id}
                  layout
                  initial={{ opacity: 0, y: -24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.7 }}
                  className="border-b border-border/20"
                >
                  <button
                    onClick={() => {
                      if (isOpen) {
                        setSelectedVoterId(null);
                        setTakeoverMode(false);
                      } else {
                        setSelectedVoterId(voter.id);
                        setTakeoverMode(false);
                        setThreadExpanded(true);
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-3 transition-colors text-start ${
                      isOpen ? 'bg-primary/10 border-r-2 border-r-primary text-foreground' : 'hover:bg-primary/5'
                    }`}
                  >
                    <VoterAvatar fullName={voter.full_name} profilePictureUrl={voter.profile_picture_url} className="h-10 w-10 shrink-0" textClassName="text-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate min-w-0">{voter.full_name || 'לא ידוע'}</p>
                        <p className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{voter.city || ''}</p>
                      </div>
                      <div className="flex items-start justify-between gap-2 mt-0.5">
                        <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          <ContentIcon text={voter.last_content} voterId={voter.id} />
                          <p className="text-base text-foreground/90 flex-1 min-w-0 break-words leading-snug line-clamp-2">{voter.last_content}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                          {voter.last_at ? format(new Date(voter.last_at), 'HH:mm') : ''}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Inline expanded thread (~2.5 messages tall, scrollable) */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="thread"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden bg-background/40 border-t border-border/20"
                      >
                        <ScrollArea className="h-[260px]">
                          <div className="space-y-3 p-4 max-w-2xl mx-auto">
                            {thread?.length === 0 && (
                              <p className="text-sm text-muted-foreground text-center py-4">אין הודעות</p>
                            )}
                            {thread?.map((msg) => {
                              const isAI = msg.role === 'assistant' || msg.role === 'ai';
                              return (
                                <div key={msg.id} className={`flex gap-2 ${isAI ? '' : 'flex-row-reverse'}`}>
                                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isAI ? 'bg-primary/15' : 'bg-accent/30'}`}>
                                    {isAI ? <Bot className="h-4 w-4 text-brand-blue" /> : <User className="h-4 w-4 text-accent-foreground" />}
                                  </div>
                                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                                    isAI
                                      ? 'bg-primary/10 border border-primary/20 text-foreground rounded-tr-sm'
                                      : 'bg-accent/25 border border-accent/40 text-foreground rounded-tl-sm'
                                  }`}>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    <p className="text-[10px] mt-1.5 text-foreground/60">
                                      {msg.created_at ? format(new Date(msg.created_at), 'dd/MM/yy · HH:mm') : ''}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>

                        {takeoverMode && (
                          <div className="p-3 border-t border-border/30 bg-background/50">
                            <div className="flex gap-2 items-end max-w-2xl mx-auto">
                              <Textarea
                                value={manualMsg}
                                onChange={(e) => setManualMsg(e.target.value)}
                                placeholder="כתוב הודעה ידנית..."
                                className="min-h-[44px] max-h-32 resize-none bg-muted/50 border-border/30 text-sm"
                                maxLength={1000}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendManual(); }
                                }}
                              />
                              <Button size="icon" onClick={handleSendManual} disabled={sending || !manualMsg.trim()} className="shrink-0 bg-primary hover:bg-primary/90">
                                <Send className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Collapse button at the bottom of the expanded window */}
                        <div className="border-t border-border/30 bg-background/60 p-2 flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedVoterId(null); setTakeoverMode(false); }}
                            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                            סגור שיחה
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </ScrollArea>
      </div>
    </div>
  );
};

export default LiveConversations;
