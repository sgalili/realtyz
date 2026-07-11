import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useState, useRef, useEffect, useMemo, cloneElement, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Send, Bot, MessageSquare, MessageCircle, Phone, AlertTriangle, Instagram, AtSign, MoreVertical, Paperclip, Mic, Facebook, Clock, Bookmark, Trash2, Mail, Plug, Inbox as InboxIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format, formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import VoterProfileSidebar from '@/components/inbox/VoterProfileSidebar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { learnFromEdit } from '@/lib/learnFromEdit';
import VoterAvatar from '@/components/VoterAvatar';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getDemoCandidateMessages, getDemoCandidateVoters } from '@/lib/demoData';
import { useDemoTicker } from '@/hooks/useDemoTicker';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { Label } from '@/components/ui/label';
import { DeliverySettings } from '@/components/DeliverySettings';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandIcon } from '@/components/BrandIcon';
import UndoLastAiMessage from '@/components/inbox/UndoLastAiMessage';

const ACCEPTED_ATTACHMENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const attachmentSchema = z.instanceof(File)
  .refine((file) => file.size <= 10 * 1024 * 1024, 'ניתן לצרף קובץ עד 10MB')
  .refine((file) => ACCEPTED_ATTACHMENT_TYPES.includes(file.type as typeof ACCEPTED_ATTACHMENT_TYPES[number]), 'סוג הקובץ לא נתמך');

const attachmentAccept = ACCEPTED_ATTACHMENT_TYPES.join(',');

const statusHebrew: Record<string, string> = {
  lead: 'מתעניין חדש',
  supporter: 'תומך',
  active: 'פעיל',
  inactive: 'לא פעיל',
  contacted: 'נוצר קשר',
};

const statusLed: Record<string, { dot: string; ring: string; note: string }> = {
  supporter: { dot: 'bg-success', ring: 'ring-success/20', note: 'מתעניין עם תמיכה חיובית גבוהה' },
  active: { dot: 'bg-primary', ring: 'ring-primary/20', note: 'מעורב ופעיל בשיחה' },
  contacted: { dot: 'bg-warning', ring: 'ring-warning/20', note: 'נוצר קשר, ממתין להמשך טיפול' },
  lead: { dot: 'bg-warning', ring: 'ring-warning/20', note: 'מתעניין חדש שדורש טיפוח' },
  inactive: { dot: 'bg-muted-foreground', ring: 'ring-muted', note: 'פעילות נמוכה או ללא תגובה לאחרונה' },
};

const senderBadge: Record<string, { label: string; className: string }> = {
  ai: { label: 'Realtyz AI', className: 'bg-primary/15 text-primary border-primary/30' },
  agent: { label: 'נציג', className: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  voter: { label: 'מתעניין', className: 'bg-slate-500/15 text-slate-700 border-slate-300' },
};


const channelConfig: Record<string, { brand?: string; icon?: ReactElement; label: string; bgClass: string; textClass: string }> = {
  whatsapp: { brand: 'whatsapp', label: 'WhatsApp', bgClass: 'bg-social-whatsapp', textClass: 'text-social-whatsapp' },
  sms: { icon: <MessageSquare />, label: 'SMS', bgClass: 'bg-social-sms', textClass: 'text-social-sms' },
  email: { icon: <Mail />, label: 'Email', bgClass: 'bg-social-email', textClass: 'text-social-email' },
  instagram: { brand: 'instagram', label: 'Instagram', bgClass: 'bg-social-instagram', textClass: 'text-social-instagram' },
  telegram: { brand: 'telegram', label: 'Telegram', bgClass: 'bg-social-telegram', textClass: 'text-social-telegram' },
  messenger: { brand: 'messenger', label: 'Messenger', bgClass: 'bg-social-messenger', textClass: 'text-social-messenger' },
  linkedin: { brand: 'linkedin', label: 'LinkedIn', bgClass: 'bg-social-linkedin', textClass: 'text-social-linkedin' },
  tiktok: { brand: 'tiktok', label: 'TikTok', bgClass: 'bg-social-tiktok', textClass: 'text-social-tiktok' },
  signal: { brand: 'signal', label: 'Signal', bgClass: 'bg-social-signal', textClass: 'text-social-signal' },
  x: { brand: 'x', label: 'X', bgClass: 'bg-social-x', textClass: 'text-social-x' },
  facebook: { brand: 'facebook', label: 'Facebook', bgClass: 'bg-social-facebook', textClass: 'text-social-facebook' },
};

const getThreadChannels = (messages: Array<{ channel?: string | null }>) =>
  [...new Set(messages.map((msg) => msg.channel).filter(Boolean) as string[])];

function getInboxSocialHandle(lead: any, platform: string): string | null {
  const prefs = (lead?.preferences ?? {}) as Record<string, any>;
  const socials = Array.isArray(prefs.socials) ? prefs.socials : [];
  const fromArr = socials.find((s: any) => String(s?.platform || '').toLowerCase() === platform)?.handle;
  const value =
    platform === 'instagram' ? (lead?.instagram_handle || fromArr) :
    platform === 'facebook' ? (lead?.facebook_handle || lead?.facebook_user_id || prefs.facebook_url || fromArr) :
    platform === 'messenger' ? (lead?.messenger_id || lead?.facebook_user_id || lead?.facebook_handle || prefs.facebook_url || fromArr) :
    platform === 'linkedin' ? (prefs.linkedin_url || fromArr) :
    platform === 'x' ? (lead?.x_username || lead?.twitter_username || prefs.x_handle || fromArr) :
    platform === 'tiktok' ? (lead?.tiktok_username || lead?.tiktok_handle || prefs.tiktok_handle || fromArr) :
    platform === 'telegram' ? (lead?.telegram_username || fromArr) :
    null;
  return value ? String(value) : null;
}

const ChannelIcon = ({ channel, size = 'sm' }: { channel: string | null; size?: 'sm' | 'md' | 'lg' }) => {
  const cfg = channelConfig[channel || 'whatsapp'] || channelConfig.whatsapp;
  const boxClass = size === 'lg' ? 'h-9 w-9' : size === 'md' ? 'h-7 w-7' : 'h-5 w-5';
  const iconClass = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  return (
    <span title={cfg.label} className={`${boxClass} inline-flex shrink-0 items-center justify-center rounded-md ${cfg.bgClass} text-social-foreground shadow-sm`}>
      {cfg.brand ? <BrandIcon name={cfg.brand} className={iconClass} /> : (typeof cfg.icon!.type === 'string' ? cfg.icon : cloneElement(cfg.icon!, { className: iconClass }))}
    </span>
  );
};


const CheckMarks = ({ isOutbound }: { isOutbound: boolean }) => (
  <span className={isOutbound ? 'text-primary' : 'text-muted-foreground'} aria-hidden="true">✓✓</span>
);

const OmnichannelInbox = () => {
  const [searchParams] = useSearchParams();
  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(searchParams.get('lead'));
  useEffect(() => {
    const v = searchParams.get('lead');
    if (v) setSelectedVoterId(v);
    const requestedChannel = searchParams.get('channel');
    if (requestedChannel && channelConfig[requestedChannel]) setSendChannel(requestedChannel);
  }, [searchParams]);
  const [search, setSearch] = useState('');
  const { settings: _platformSettings, update: _updatePlatformSettings } = usePlatformSettings();
  const aiAutopilot = _platformSettings.enable_ai_autopilot === true;
  const setAiAutopilot = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(aiAutopilot) : next;
    if (value === aiAutopilot) return;
    _updatePlatformSettings({ enable_ai_autopilot: value }).catch(() => {
      toast.error('שמירת מצב המענה האוטומטי נכשלה');
    });
  };
  const [activeTab, setActiveTab] = useState<'all' | 'waiting' | 'handling'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'telegram' | 'messenger' | 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok' | 'sms' | 'email'>('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  // Tracks the last AI-generated draft (e.g. from Undo & Regenerate) so manual
  // edits before send can be shipped to learn-from-edit. Cleared on send/switch.
  const [originalAiDraft, setOriginalAiDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sendChannel, setSendChannel] = useState<string>(() => searchParams.get('channel') || 'whatsapp');
  const [dripEnabled, setDripEnabled] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [sendWindowStart, setSendWindowStart] = useState('08:00');
  const [sendWindowEnd, setSendWindowEnd] = useState('20:00');
  const [delayMin, setDelayMin] = useState(7);
  const [delayMax, setDelayMax] = useState(23);
  const [manualTakeoverWarning, setManualTakeoverWarning] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [inviteChannel, setInviteChannel] = useState<string | null>(null);
  const [inviteVia, setInviteVia] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [inviteSending, setInviteSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleDeleteChat = async (voterId: string) => {
    if (!voterId || voterId.startsWith('demo-')) {
      toast.error('לא ניתן למחוק שיחה זו');
      setDeleteTargetId(null);
      return;
    }
    setIsDeletingChat(true);
    try {
      if (voterId.startsWith('phone:')) {
        const phone = voterId.slice('phone:'.length);
        const { error } = await supabase
          .from('messages')
          .delete()
          .is('lead_id', null)
          .filter('metadata->>sender_phone', 'eq', phone);
        if (error) throw error;
      } else {
        // Delete child rows first, then the lead row itself so the conversation
        // actually disappears from the inbox (the inbox is driven off the leads table).
        await supabase.from('chat_history').delete().eq('lead_id', voterId);
        await supabase.from('messages').delete().eq('lead_id', voterId);
        const { error } = await supabase.rpc('gdpr_delete_lead', { _lead_id: voterId });
        if (error) {
          // Fallback: try a plain delete on leads if the RPC is unavailable
          const { error: delErr } = await supabase.from('leads').delete().eq('id', voterId);
          if (delErr) throw delErr;
        }
      }
      toast.success('השיחה נמחקה לצמיתות');
      if (selectedVoterId === voterId) setSelectedVoterId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['last-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox-leads'] }),
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox-chats'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-recent-msgs'] }),
      ]);
    } catch (err: any) {
      console.error('[delete-chat]', err);
      toast.error('מחיקת השיחה נכשלה');
    } finally {
      setIsDeletingChat(false);
      setDeleteTargetId(null);
    }
  };

  const { isDemoMode, demoCandidateId } = useDemoMode();
  const demoTicker = useDemoTicker();
  const blockDemoAction = useDemoGuard();

  useRealtimeSubscription('messages', [
    ['inbox-leads'],
    ['last-messages'],
    ['chat-messages', selectedVoterId ?? ''],
    ['lead-recent-msgs', selectedVoterId ?? ''],
  ]);
  useRealtimeSubscription('leads', [['inbox-leads']]);

  const { data: dbVoters } = useQuery({
    queryKey: ['inbox-leads'],
    enabled: !isDemoMode,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('*').order('last_interaction_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: dbLastMessages } = useQuery({
    queryKey: ['last-messages'],
    enabled: !isDemoMode,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
      const map = new Map<string, typeof data[0]>();
      data?.forEach((msg) => {
        if (msg.lead_id && !map.has(msg.lead_id)) map.set(msg.lead_id, msg);
      });
      return map;
    },
  });

  // === PHONE-ANCHORED FALLBACK ===
  // Messages whose lead_id is null (or whose lead row is hidden by RLS) would
  // otherwise vanish from the inbox. Surface them grouped by sender_phone so
  // the broker never misses an inbound WhatsApp reply.
  const { data: orphanThreads } = useQuery({
    queryKey: ['orphan-phone-threads'],
    enabled: !isDemoMode,
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .is('lead_id', null)
        .order('created_at', { ascending: false })
        .limit(200);
      const map = new Map<string, any>();
      (data ?? []).forEach((m: any) => {
        const phone = (m.metadata as any)?.sender_phone;
        if (!phone) return;
        if (!map.has(phone)) map.set(phone, { phone, last: m, messages: [m] });
        else map.get(phone).messages.push(m);
      });
      return Array.from(map.values());
    },
  });

  const { data: dbChatMessages } = useQuery({
    queryKey: ['chat-messages', selectedVoterId],
    enabled: !!selectedVoterId && !isDemoMode,
    refetchInterval: 3000,
    queryFn: async () => {
      // Phone-anchored synthetic thread (id = "phone:9725...").
      if (selectedVoterId?.startsWith('phone:')) {
        const phone = selectedVoterId.slice('phone:'.length);
        const { data } = await supabase
          .from('messages')
          .select('*')
          .is('lead_id', null)
          .order('created_at', { ascending: true });
        return (data ?? []).filter((m: any) => (m.metadata as any)?.sender_phone === phone);
      }
      const { data } = await supabase.from('messages').select('*').eq('lead_id', selectedVoterId!).order('created_at', { ascending: true });
      return data ?? [];
    },
  });

  // Demo mode data interception
  const demoVoters = useMemo(() => getDemoCandidateVoters(demoCandidateId), [demoCandidateId]);
  const demoMessages = useMemo(() => getDemoCandidateMessages(demoCandidateId), [demoCandidateId]);
  const [liveDemoVoters, setLiveDemoVoters] = useState<Array<(typeof demoVoters)[number]>>([]);

  useEffect(() => {
    if (!isDemoMode || demoVoters.length === 0) return;
    setLiveDemoVoters(demoVoters.slice(0, 12));
  }, [isDemoMode, demoCandidateId, demoVoters]);

  // Every 3s in demo mode, prepend a NEW unique lead to the top of the list.
  // Pause completely while a lead card is selected/expanded.
  // Preload the avatar image BEFORE inserting so the card never flashes.
  useEffect(() => {
    if (!isDemoMode || demoVoters.length === 0) return;
    if (selectedVoterId) return; // freeze additions while a card is expanded
    let cancelled = false;
    const interval = setInterval(() => {
      setLiveDemoVoters((current) => {
        const visibleIds = new Set(current.map((v) => v.id));
        const candidates = demoVoters.filter((v) => !visibleIds.has(v.id));
        if (candidates.length === 0) return current;
        const next = candidates[Math.floor(Math.random() * candidates.length)];
        const newVoter = { ...next, last_interaction_at: new Date().toISOString() };

        const url = (newVoter as any).profile_picture_url;
        if (url) {
          const img = new Image();
          img.src = url;
          if (img.complete && img.naturalWidth > 0) {
            // already cached - insert now
            return [newVoter, ...current].slice(0, 50);
          }
          // not cached: preload, then insert on next tick
          img.onload = () => {
            if (cancelled) return;
            setLiveDemoVoters((cur) => {
              if (cur.find((v) => v.id === newVoter.id)) return cur;
              return [newVoter, ...cur].slice(0, 50);
            });
          };
          img.onerror = () => {
            if (cancelled) return;
            setLiveDemoVoters((cur) => {
              if (cur.find((v) => v.id === newVoter.id)) return cur;
              return [newVoter, ...cur].slice(0, 50);
            });
          };
          return current; // wait for preload
        }
        return [newVoter, ...current].slice(0, 50);
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isDemoMode, selectedVoterId, demoVoters]);

  const voters = useMemo(() => {
    const base = isDemoMode
      ? (() => {
          const real = dbVoters ?? [];
          const demoIds = new Set(demoVoters.map((v) => v.id));
          return [...liveDemoVoters, ...real.filter(v => !demoIds.has(v.id))];
        })()
      : (dbVoters ?? []);
    // INBOX MUST SHOW CONVERSATIONS ONLY: hide every contact that has zero
    // exchanged messages. We keep a row only when there is a corresponding
    // last-message entry (i.e. `messages` contains a row for this lead).
    const msgIds = new Set<string>((dbLastMessages ? Array.from((dbLastMessages as Map<string, any>).keys()) : []));
    const conversational = (base as any[]).filter((v: any) => {
      if (isDemoMode && String(v?.id ?? '').startsWith('demo-lead-')) return true;
      return v?.id && msgIds.has(v.id);
    });
    // Append phone-anchored synthetic voters for orphan inbound messages so
    // the broker can still open the thread when the lead row is missing/hidden.
    const knownPhones = new Set(conversational.map((v: any) => v.phone_number).filter(Boolean));
    const synthetic = (orphanThreads ?? [])
      .filter((t: any) => !knownPhones.has(t.phone))
      .map((t: any) => ({
        id: `phone:${t.phone}`,
        full_name: null,
        phone_number: t.phone,
        last_interaction_at: t.last?.created_at ?? new Date().toISOString(),
        sentiment: 'neutral',
        loyalty_tier: 'Unassigned',
        status: 'contacted',
        _synthetic: true,
      }));
    return [...synthetic, ...conversational];
  }, [isDemoMode, dbVoters, demoVoters, liveDemoVoters, orphanThreads, dbLastMessages]);


  const lastMessages = useMemo(() => {
    const base = new Map(dbLastMessages ?? new Map());
    (orphanThreads ?? []).forEach((t: any) => {
      base.set(`phone:${t.phone}`, t.last);
    });
    if (isDemoMode) {
      voters.slice(0, 50).forEach(v => {
        const msgs = demoMessages.filter(m => m.lead_id === v.id);
        if (msgs.length > 0) {
          const last = { ...msgs[msgs.length - 1], created_at: v.last_interaction_at };
          base.set(v.id, last as any);
        }
      });
    }
    return base;
  }, [isDemoMode, dbLastMessages, voters, demoMessages, orphanThreads]);

  const chatMessages = useMemo(() => {
    if (isDemoMode && selectedVoterId?.startsWith('demo-lead-')) {
      return demoMessages.filter(m => m.lead_id === selectedVoterId).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return dbChatMessages ?? [];
  }, [isDemoMode, selectedVoterId, dbChatMessages, demoMessages]);

  const selectedVoter = voters?.find((v) => v.id === selectedVoterId);

  // Fire-and-forget: fetch WhatsApp profile picture for the selected lead
  // if it's missing. The edge function updates leads.profile_picture_url
  // and the next voters refetch will pick it up automatically.
  useEffect(() => {
    const v = selectedVoter as any;
    if (!v?.id) return;
    if (v?.profile_picture_url) return;
    if (!v?.phone_number) return;
    supabase.functions
      .invoke('fetch-wa-avatars', { body: { lead_ids: [v.id] } })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['inbox-leads'] });
      })
      .catch(() => {});
  }, [selectedVoter?.id, queryClient]);

  // Batch-hydrate avatars for every visible lead in the sidebar list that's
  // still missing one. Runs once per list change; the edge function itself
  // skips rows that already have a URL so this is safe & idempotent.
  useEffect(() => {
    if (!voters?.length) return;
    const missing = voters
      .filter((v: any) => !v.profile_picture_url && v.phone_number)
      .map((v: any) => v.id);
    if (!missing.length) return;
    const flagKey = `wa-avatar-batch:${missing.slice(0, 20).join(',')}`;
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, '1');
    supabase.functions
      .invoke('fetch-wa-avatars', { body: { lead_ids: missing.slice(0, 50) } })
      .then(() => queryClient.invalidateQueries({ queryKey: ['inbox-leads'] }))
      .catch(() => {});
  }, [voters, queryClient]);


  // ---- Channel availability ----------------------------------------------
  // A channel is enabled in the send-channel selector only when BOTH:
  //   (a) the voter has a usable identifier for it in the CRM profile, AND
  //   (b) the channel is "open" — either WhatsApp/SMS (broker-initiated by
  //       phone) or we've already received an inbound message from this
  //       voter on that channel (proxy for the channel being reachable).
  const availableChannels = useMemo(() => {
    const v = (selectedVoter ?? {}) as any;
    const phone = !!v?.phone_number;
    const inboundChannels = new Set<string>();
    (chatMessages ?? []).forEach((m: any) => {
      if (m?.direction === 'inbound' && m?.channel) inboundChannels.add(String(m.channel));
    });
    const handle = {
      whatsapp: phone,
      sms: phone,
      instagram: !!v?.instagram_handle,
      telegram: !!v?.telegram_username,
      messenger: !!(v?.messenger_id || v?.facebook_user_id || v?.facebook_handle),
      tiktok: !!(v?.tiktok_username || v?.tiktok_handle),
      signal: phone,
      x: !!(v?.x_username || v?.twitter_username),
      facebook: !!(v?.facebook_user_id || v?.facebook_handle),
      linkedin: !!getInboxSocialHandle(v, 'linkedin'),
    } as Record<string, boolean>;
    const result: Record<string, boolean> = {};
    Object.keys(channelConfig).forEach((key) => {
      const hasHandle = !!handle[key];
      // Rule: if we've already received an inbound message from this lead on
      // that channel, the channel is reachable — enable it regardless of
      // whether a matching handle was pre-populated in the CRM profile.
      // Otherwise fall back to the handle-based rule (WhatsApp/SMS work by
      // phone alone; other channels need a stored identifier).
      if (inboundChannels.has(key)) {
        result[key] = true;
      } else {
        result[key] = hasHandle && (key === 'whatsapp' || key === 'sms');
      }
    });
    return result;
  }, [selectedVoter, chatMessages]);

  useEffect(() => {
    const requestedChannel = searchParams.get('channel');
    if (!selectedVoterId || !requestedChannel || !channelConfig[requestedChannel]) return;
    if (availableChannels[requestedChannel]) {
      setSendChannel(requestedChannel);
      return;
    }
    setInviteVia(selectedVoter?.phone_number ? 'whatsapp' : 'sms');
    setInviteChannel(requestedChannel);
  }, [searchParams, selectedVoterId, selectedVoter?.phone_number, availableChannels]);


  // The latest outbound AI/agent message in the current thread is the only one
  // eligible for "Undo & Regenerate". This keeps the affordance focused on the
  // most recent automated reply that Udi might want to retract.
  const lastAiMessageId = useMemo(() => {
    if (!chatMessages?.length) return null;
    const FIVE_MIN = 5 * 60 * 1000;
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m: any = chatMessages[i];
      const isOutbound = m.direction === 'outbound';
      const isAi = m.sender_type === 'ai' || m.sender_type === 'ai_agent' || m.ai_assisted === true;
      const fresh = m.created_at && Date.now() - new Date(m.created_at).getTime() < FIVE_MIN;
      // Only allow undo on demo/non-demo real DB rows (uuid id), not synthetic demo entries.
      const realRow = typeof m.id === 'string' && /^[0-9a-f-]{36}$/i.test(m.id);
      if (isOutbound && isAi && fresh && realRow) return m.id as string;
      if (isOutbound && !isAi) return null; // a human reply already followed
      if (!isOutbound) return null;          // lead replied — too late to undo
    }
    return null;
  }, [chatMessages]);

  const sendMessage = useMutation({
    mutationFn: async ({ content, file, original }: { content: string; file: File | null; original: string }) => {
      if (blockDemoAction('send-message')) throw new Error('demo-blocked');
      const safeContent = content.trim().slice(0, 2000);
      const attachmentText = file ? `\n\n📎 ${file.name} (${Math.round(file.size / 1024)}KB)` : '';
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: {
          lead_id: selectedVoterId,
          content: `${safeContent}${attachmentText}`.trim(),
          channel: sendChannel,
          phone_number: selectedVoter?.phone_number,
          attachment: file ? { name: file.name, type: file.type, size: file.size } : null,
          drip: {
            enabled: dripEnabled,
            daily_limit: dailyLimit,
            send_window_start: sendWindowStart,
            send_window_end: sendWindowEnd,
            stagger_min_minutes: delayMin,
            stagger_max_minutes: delayMax,
          },
        },
      });
      if (error) throw error;
      // Active-learning capture: when the broker edited an AI-seeded draft.
      learnFromEdit({
        context: `inbox_reply:${sendChannel}`,
        pairs: [{ label: 'inbox_message', original, edited: safeContent }],
      });
      return data;
    },
    onSuccess: async (data) => {
      setNewMessage('');
      setOriginalAiDraft('');
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedVoterId] });
      queryClient.invalidateQueries({ queryKey: ['last-messages'] });
      queryClient.invalidateQueries({ queryKey: ['inbox-leads'] });

      // Autopilot status is owned by the user — never auto-disable on manual send.

      toast.success('ההודעה הועברה לתור אישור', {
        description: 'שום דבר לא נשלח עד שמפקח אנושי מאשר ומפעיל ידנית',
      });
    },
    onError: (error: Error) => { if (error.message !== 'demo-blocked') toast.error('שליחת ההודעה נכשלה'); },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const waitingCount = useMemo(() => {
    if (!voters || !lastMessages) return 0;
    return voters.filter((v) => {
      const m: any = lastMessages.get(v.id);
      return m && m.direction === 'inbound';
    }).length;
  }, [voters, lastMessages]);
  const handlingCount = useMemo(() => {
    if (!voters || !lastMessages) return 0;
    return voters.filter((v) => {
      const m: any = lastMessages.get(v.id);
      return m && m.direction === 'outbound' && (m.sender_type === 'ai' || m.ai_assisted);
    }).length;
  }, [voters, lastMessages]);
  const totalCount = voters?.length ?? 0;

  const matchesLeadSearch = (v: any, q: string) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const prefs = (v?.preferences ?? {}) as Record<string, any>;
    const hay = [
      v?.full_name, v?.phone_number, v?.email, v?.address, v?.city, v?.neighborhood,
      v?.gender, v?.notes, v?.status, v?.lead_stage, v?.deal_type,
      v?.instagram_handle, v?.facebook_handle, v?.messenger_id, v?.tiktok_handle,
      v?.x_handle, v?.youtube_url, prefs.facebook_url, prefs.linkedin_url,
      ...(Array.isArray(prefs.socials) ? prefs.socials.map((s: any) => `${s?.platform} ${s?.handle} ${s?.url}`) : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle) || (v?.phone_number || '').includes(q);
  };

  const filteredVoters = (() => {
    const base = (voters ?? []).filter((v) => {
      if (!matchesLeadSearch(v, search)) return false;
      const m: any = lastMessages?.get(v.id);
      if (channelFilter !== 'all' && String(m?.channel || '') !== channelFilter) return false;
      if (activeTab === 'waiting') return m?.direction === 'inbound';
      if (activeTab === 'handling') return m?.direction === 'outbound' && (m?.sender_type === 'ai' || m?.ai_assisted);
      if (bookmarkedOnly) return (v as any).is_bookmarked === true;
      return true;
    });
    // When the user is searching, also surface CRM leads that don't have an
    // active conversation yet, so the broker can initiate a chat via any
    // available channel (WhatsApp / invite link / etc.).
    if (search.trim() && activeTab === 'all' && !bookmarkedOnly) {
      const known = new Set(base.map((v: any) => v.id));
      const extras = (dbVoters ?? [])
        .filter((v: any) => v?.id && !known.has(v.id) && matchesLeadSearch(v, search))
        .map((v: any) => ({ ...v, _noConversation: true }));
      return [...base, ...extras];
    }
    return base;
  })();

  const handleSend = () => {
    const content = newMessage.trim();
    if (!content && !attachment) return;
    sendMessage.mutate({ content: content || 'קובץ מצורף', file: attachment, original: originalAiDraft });
  };

  const handleAttachmentSelect = (file: File | undefined) => {
    if (!file) return;
    const parsed = attachmentSchema.safeParse(file);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || 'קובץ לא תקין');
      return;
    }
    setAttachment(file);
  };

  return (
    <div dir="rtl" className="space-y-3">
      {/* Filter pills + bookmark */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-row-reverse items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('handling')}
            className={`h-10 inline-flex items-center gap-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap border ${activeTab === 'handling' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted/50'}`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span>בטיפול ({handlingCount}) AI</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('waiting')}
            className={`h-10 inline-flex items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap border ${activeTab === 'waiting' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted/50'}`}
          >
            מחכות למענה ({waitingCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`h-10 inline-flex items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap border ${activeTab === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted/50'}`}
          >
            כל השיחות ({totalCount})
          </button>
        </div>
        <button
          type="button"
          onClick={() => setBookmarkedOnly((v) => !v)}
          aria-label="סימניות"
          className={`h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border ${bookmarkedOnly ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted/50'}`}
        >
          <Bookmark className="h-4 w-4" />
        </button>
      </div>

      {/* Channel filter — icons only, no pill background */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {([
          { key: 'all', label: 'הכל' },
          { key: 'whatsapp', label: 'WhatsApp' },
          { key: 'messenger', label: 'Messenger' },
          { key: 'facebook', label: 'Facebook' },
          { key: 'instagram', label: 'Instagram' },
          { key: 'linkedin', label: 'LinkedIn' },
          { key: 'x', label: 'X' },
          { key: 'tiktok', label: 'TikTok' },
          { key: 'telegram', label: 'Telegram' },
          { key: 'sms', label: 'SMS' },
          { key: 'email', label: 'Email' },
        ] as const).map((c) => {
          const active = channelFilter === c.key;
          const isAvail = c.key === 'all' ? true : !!availableChannels[c.key];
          const handleClick = () => {
            setChannelFilter(c.key);
            if (c.key === 'all') return;
            // Only switch the composer channel when there's a selected lead.
            if (!selectedVoterId) return;
            if (isAvail) {
              setSendChannel(c.key);
            } else {
              // Channel not open yet — offer to send an invite via SMS/WA.
              setInviteVia(selectedVoter?.phone_number ? 'whatsapp' : 'sms');
              setInviteChannel(c.key);
            }
          };
          return (
            <button
              key={c.key}
              type="button"
              onClick={handleClick}
              aria-label={c.label}
              title={c.label}
              aria-pressed={active}
              className={`h-9 shrink-0 inline-flex items-center justify-center transition-opacity ${c.key === 'all' ? 'px-2' : 'w-9'} ${active ? 'opacity-100' : 'opacity-50 hover:opacity-100'} ${selectedVoterId && !isAvail && c.key !== 'all' ? 'ring-1 ring-dashed ring-muted-foreground/30 rounded-full' : ''}`}
            >
              {c.key === 'all'
                ? <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>הכל</span>
                : <ChannelIcon channel={c.key} size="md" />}
            </button>
          );
        })}
        <div className="ms-auto" />
        <button
          type="button"
          onClick={() => navigate('/api-settings')}
          aria-label="הגדרות חיבור ערוצים"
          title="הגדרות חיבור ערוצים"
          className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <Plug className="h-5 w-5" />
        </button>
      </div>





      <div className="grid h-[calc(100svh-300px)] min-h-[480px] w-full grid-cols-1 overflow-hidden rounded-xl border border-border/50 bg-card shadow-soft lg:h-[calc(100vh-340px)] lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_18rem]">
        {/* Right panel - Contact List */}
        <div className={`${selectedVoterId ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col border-l bg-card`}>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש שיחות..."
                className="pr-9 h-9 bg-muted/50 border-0"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <AnimatePresence initial={false}>
              {filteredVoters?.map((voter) => {
                const lastMsg = lastMessages?.get(voter.id);
                const isActive = voter.id === selectedVoterId;
                return (
                  <motion.div
                    key={voter.id}
                    layout
                    initial={{ opacity: 0, y: -24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.7 }}
                    dir="ltr"
                    onClick={() => setSelectedVoterId(isActive ? null : voter.id)}
                    className={`relative flex min-w-0 flex-row-reverse items-start gap-3 overflow-hidden px-3 py-3 ps-8 cursor-pointer border-b border-border/30 transition-colors ${isActive ? 'bg-accent' : 'hover:bg-muted/50'}`}
                  >
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setDeleteTargetId(voter.id); }}
                      aria-label="מחיקת שיחה"
                      title="מחיקת שיחה"
                      className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); navigate(`/lead-crm/${voter.id}`); }}
                      className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                      title="פתיחת כרטיס מתעניין"
                      aria-label="פתיחת כרטיס מתעניין"
                    >
                      <VoterAvatar fullName={voter.full_name} profilePictureUrl={(voter as any).profile_picture_url} className="h-10 w-10 shrink-0" textClassName="text-sm" />
                    </button>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex min-w-0 flex-row-reverse items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); navigate(`/lead-crm/${voter.id}`); }}
                          className="text-sm font-medium truncate min-w-0 hover:underline text-right"
                          title="פתיחת כרטיס מתעניין"
                        >
                          {voter.full_name || formatPhoneDisplay(voter.phone_number)}
                        </button>
                        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                          {voter.last_interaction_at ? formatDistanceToNow(new Date(voter.last_interaction_at), { addSuffix: true, locale: he }) : ''}
                        </span>
                      </div>
                      <div className="flex flex-row-reverse items-start gap-1 mt-0.5">
                        {lastMsg?.channel && <span className="shrink-0 mt-0.5"><ChannelIcon channel={lastMsg.channel} /></span>}
                        <p className="text-xs text-muted-foreground flex-1 min-w-0 max-w-full overflow-hidden break-all whitespace-pre-wrap leading-snug line-clamp-2">
                          {lastMsg?.content || 'אין הודעות'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {filteredVoters?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {channelFilter === 'all' ? 'אין שיחות' : 'אין הודעות בערוץ זה'}
              </p>
            )}
          </ScrollArea>
        </div>

        {/* Center panel - Chat Window */}
        <div className={`${selectedVoterId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col overflow-hidden bg-whatsapp-chat lg:flex`}>
          {!selectedVoterId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">בחר שיחה לצפייה בהודעות</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-14 border-b border-whatsapp-header/20 bg-whatsapp-header text-whatsapp-header-foreground flex items-center justify-between px-3 sm:px-4 shrink-0">
                <div className="flex min-w-0 items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-whatsapp-header-foreground hover:bg-whatsapp-header-foreground/10 lg:hidden" onClick={() => setSelectedVoterId(null)}>
                    <span className="text-xl leading-none scale-x-[-1]">›</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => selectedVoterId && navigate(`/lead-crm/${selectedVoterId}`)}
                    className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-white/50"
                    title="פתיחת כרטיס מתעניין"
                    aria-label="פתיחת כרטיס מתעניין"
                  >
                    <VoterAvatar fullName={selectedVoter?.full_name} profilePictureUrl={(selectedVoter as any)?.profile_picture_url} className="h-9 w-9" textClassName="text-xs" />
                  </button>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => selectedVoterId && navigate(`/lead-crm/${selectedVoterId}`)}
                      className="block truncate text-sm font-semibold hover:underline text-right"
                      title="פתיחת כרטיס מתעניין"
                    >
                      {selectedVoter?.full_name || formatPhoneDisplay(selectedVoter?.phone_number || '')}
                    </button>
                    <p className="text-[10px] text-whatsapp-header-foreground/75">{selectedVoter?.city || 'WhatsApp Business'}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-whatsapp-header-foreground hover:bg-whatsapp-header-foreground/10">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 text-right">
                    <DropdownMenuItem onClick={() => setManualTakeoverWarning(true)}>העברה לנציג</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAiAutopilot((value) => !value)}>{aiAutopilot ? 'כיבוי AI אוטומטי' : 'הפעלת AI אוטומטי'}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info('השיחה סומנה למעקב')}>סימון למעקב</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toast.info('פרופיל הליד פתוח בצד')}>הצגת פרופיל מתעניין</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => selectedVoterId && setDeleteTargetId(selectedVoterId)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="ms-2 h-4 w-4" />
                      מחיקת שיחה
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Manual takeover warning */}
              {manualTakeoverWarning && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 text-primary">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium">הבוט הופסק לצורך שיחה ידנית</span>
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 p-2 sm:p-4 whatsapp-chat-bg">
                <div className="mx-auto w-full max-w-3xl space-y-2 overflow-hidden">
                  {chatMessages?.length === 0 && (
                    <p className="rounded-lg bg-whatsapp-bubble-in/80 px-3 py-2 text-center text-sm text-muted-foreground shadow-sm">אין הודעות עדיין</p>
                  )}
                  {chatMessages?.map((msg, idx) => {
                    const isOutbound = msg.direction === 'outbound';
                    const senderType = msg.sender_type || (isOutbound ? 'agent' : 'lead');
                    const badge = senderBadge[senderType] || senderBadge.voter;
                    const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
                    const channelChanged = prevMsg && prevMsg.channel !== msg.channel && msg.channel;
                    const channelLabel = channelConfig[msg.channel || '']?.label || msg.channel;

                    return (
                      <div key={msg.id}>
                        {channelChanged && (
                          <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">- השיחה עברה ל{channelLabel} -</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <div className={`flex min-w-0 items-end gap-2 ${isOutbound ? 'justify-start' : 'justify-end flex-row-reverse'}`}>
                          {!isOutbound && (
                            <VoterAvatar
                              fullName={selectedVoter?.full_name}
                              profilePictureUrl={(selectedVoter as any)?.profile_picture_url}
                              className="h-7 w-7 shrink-0"
                              textClassName="text-[10px]"
                            />
                          )}
                          <div className={`relative min-w-0 max-w-[78%] overflow-hidden rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${isOutbound ? 'bg-whatsapp-bubble-out text-foreground rounded-es-sm' : 'bg-whatsapp-bubble-in text-foreground rounded-ee-sm'}`}>
                            {msg.id === lastAiMessageId && selectedVoterId && (
                              <UndoLastAiMessage
                                messageId={msg.id as string}
                                leadId={selectedVoterId}
                                leadName={selectedVoter?.full_name ?? null}
                                leadCity={(selectedVoter as any)?.city ?? null}
                                leadStage={(selectedVoter as any)?.lead_stage ?? null}
                                onRegenerated={(draft) => { setNewMessage(draft); setOriginalAiDraft(draft); }}
                                onDeleted={() => {
                                  queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedVoterId] });
                                  queryClient.invalidateQueries({ queryKey: ['last-messages'] });
                                }}
                              />
                            )}
                            <div className="mb-1 flex items-center justify-end gap-1.5">
                              <Badge variant="outline" className={`px-1 py-0 text-[9px] border ${badge.className}`}>
                                {badge.label}
                              </Badge>
                              <ChannelIcon channel={msg.channel} />
                            </div>
                            <p className="max-w-full overflow-hidden whitespace-pre-wrap break-all text-sm leading-relaxed">{msg.content}</p>
                            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                              <span>{msg.created_at ? format(new Date(msg.created_at), 'HH:mm') : ''}</span>
                              <CheckMarks isOutbound={isOutbound} />
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t border-border/50 bg-whatsapp-footer p-2 sm:p-3">
                {aiAutopilot && !manualTakeoverWarning ? (
                  <div className="flex items-center gap-2 rounded-full bg-whatsapp-bubble-in px-3 py-2 text-whatsapp-header shadow-sm">
                    <Switch checked={aiAutopilot} className="border-whatsapp-header/20 bg-muted data-[state=checked]:bg-whatsapp-header [&>span]:bg-whatsapp-header-foreground" onCheckedChange={(v) => {
                      setAiAutopilot(v);
                      if (v) setManualTakeoverWarning(false);
                    }} />
                    <span className="text-xs font-medium">טייס אוטומטי פעיל - ה-AI עונה באופן אוטומטי</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Switch checked={aiAutopilot} className="border-whatsapp-header/20 bg-muted data-[state=checked]:bg-whatsapp-header [&>span]:bg-whatsapp-header-foreground" onCheckedChange={(v) => {
                      setAiAutopilot(v);
                      if (v) setManualTakeoverWarning(false);
                    }} />
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept={attachmentAccept}
                      className="hidden"
                      onChange={(e) => handleAttachmentSelect(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => attachmentInputRef.current?.click()}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-whatsapp-bubble-in text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                      title="צירוף קובץ"
                      aria-label="צירוף קובץ"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-whatsapp-bubble-in ps-2 pe-3 shadow-sm">
                      <Select value={sendChannel} onValueChange={setSendChannel}>
                        <SelectTrigger
                          className="h-8 w-8 shrink-0 justify-center rounded-full border-0 bg-transparent p-0 shadow-none hover:bg-muted/60 focus:ring-0 [&>svg:last-child]:hidden"
                          title="ערוץ שליחה"
                          aria-label="ערוץ שליחה"
                        >
                          {(() => {
                            const cfg = channelConfig[sendChannel] || channelConfig.whatsapp;
                            return cfg.brand ? (
                              <BrandIcon name={cfg.brand} className={`h-5 w-5 ${cfg.textClass}`} />
                            ) : (
                              <span className={cfg.textClass}>{cloneElement(cfg.icon!, { className: 'h-5 w-5' })}</span>
                            );
                          })()}
                        </SelectTrigger>
                        <SelectContent align="end" className="min-w-[12rem]">
                          {Object.entries(channelConfig).map(([key, cfg]) => {
                            const disabled = !availableChannels[key];
                            return (
                              <SelectItem key={key} value={key} disabled={disabled} title={cfg.label}>
                                <div className={`flex items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
                                  <ChannelIcon channel={key} />
                                  <span className="text-xs">{cfg.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder={attachment ? `מצורף: ${attachment.name}` : 'הקלד הודעה...'}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        className="h-11 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                      />
                      {attachment && (
                        <button
                          type="button"
                          onClick={() => {
                            setAttachment(null);
                            if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                          }}
                          className="shrink-0 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          הסר
                        </button>
                      )}
                    </div>
                    <Button onClick={handleSend} disabled={(!newMessage.trim() && !attachment) || sendMessage.isPending} size="icon" title="שלח" className="h-11 w-11 shrink-0 rounded-full bg-whatsapp-header text-whatsapp-header-foreground hover:bg-whatsapp-header/90">
                      {newMessage.trim() || attachment ? <Send className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Left panel - Lead Profile Sidebar */}
        {selectedVoter && (
          <div className="hidden min-w-0 border-e bg-card xl:block">
            <VoterProfileSidebar voter={selectedVoter} />
          </div>
        )}
      </div>
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent className="text-right" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את השיחה?</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו תמחק את כל ההודעות בשיחה לצמיתות. הליד עצמו יישאר ב-CRM. לא ניתן לשחזר את ההודעות.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-between items-center w-full gap-4 mt-6 sm:flex-row sm:justify-between sm:space-x-0">
            <AlertDialogCancel disabled={isDeletingChat} className="mt-0 flex-1">ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingChat}
              onClick={(e) => { e.preventDefault(); if (deleteTargetId) handleDeleteChat(deleteTargetId); }}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingChat ? 'מוחק...' : 'מחק שיחה'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite modal — sends WA/SMS invite so the lead opens the closed channel */}
      <Dialog open={!!inviteChannel} onOpenChange={(open) => { if (!open) setInviteChannel(null); }}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הזמנה לערוץ {channelConfig[inviteChannel || '']?.label || inviteChannel}</DialogTitle>
            <DialogDescription>
              הערוץ עדיין לא פתוח מול הליד. נשלח קישור הזמנה קצר בוואטסאפ או SMS כדי שהוא יפתח שיחה עם העסק.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={inviteVia} onValueChange={(v) => setInviteVia(v as any)} className="space-y-2">
            <label className="flex flex-row-reverse items-center justify-between gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
              <span className="text-sm">שליחה בוואטסאפ</span>
              <RadioGroupItem value="whatsapp" disabled={!selectedVoter?.phone_number} />
            </label>
            <label className="flex flex-row-reverse items-center justify-between gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
              <span className="text-sm">שליחה ב-SMS</span>
              <RadioGroupItem value="sms" disabled={!selectedVoter?.phone_number} />
            </label>
          </RadioGroup>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setInviteChannel(null)} disabled={inviteSending}>ביטול</Button>
            <Button
              disabled={inviteSending || !selectedVoter?.phone_number || !inviteChannel}
              onClick={async () => {
                if (!selectedVoterId || !inviteChannel) return;
                setInviteSending(true);
                const label = channelConfig[inviteChannel]?.label || inviteChannel;
                const body = `שלום, נשמח להמשיך את השיחה גם ב-${label}. לחצו כאן לפתיחת ההתכתבות: {LINK}`;
                const { error } = await supabase.functions.invoke('send-message', {
                  body: {
                    lead_id: selectedVoterId,
                    content: body,
                    channel: inviteVia,
                    phone_number: selectedVoter?.phone_number,
                    invite_channel: inviteChannel,
                  },
                });
                setInviteSending(false);
                if (error) toast.error('שליחת ההזמנה נכשלה');
                else {
                  toast.success('ההזמנה נשלחה');
                  setInviteChannel(null);
                }
              }}
            >
              {inviteSending ? 'שולח...' : 'שליחת הזמנה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OmnichannelInbox;
