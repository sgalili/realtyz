import { useCampaignPricing } from '@/hooks/useCampaignPricing';
import { campaignServicePrice, campaignServiceEstimate, formatCampaignCredits } from '@/lib/campaignServicePricing';
import { CampaignServiceIcon } from '@/components/campaigns/CampaignServiceIcon';
import { useCreditWallet } from '@/hooks/useSubscription';
import { ilsToCredits } from '@/lib/credits';
import { getOfficialWaNumber } from '@/lib/officialWa';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import confetti from 'canvas-confetti';
import { Mail, MessageCircle, Radio, Send, Smartphone, Sparkles, WalletCards, Zap, CheckCircle2, Users, MessageSquare, Coins, Shield, ShieldCheck, AlertTriangle, Clock, List, Filter, FileSpreadsheet, X, Mic, AudioWaveform, AudioLines, Paperclip, Image as ImageIcon, FileText, Film, Square, StopCircle, Linkedin, Instagram, Send as TelegramIcon, Plug, ChevronDown, Settings2, PhoneCall, Check, Twitter, Youtube, Facebook } from 'lucide-react';
import { TikTokOfficial } from '@/components/social/brand-icons/TikTokOfficial';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { VoiceComposer, type VoicePayload } from '@/components/VoiceComposer';
import { supabase } from '@/integrations/supabase/client';
import { WaTemplatePicker, type WaTemplateSelection } from '@/components/whatsapp/WaTemplatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DeliverySettings } from '@/components/DeliverySettings';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type ChannelId = 'whatsapp' | 'sms' | 'email' | 'voice' | 'ivr' | 'linkedin' | 'instagram' | 'tiktok' | 'telegram' | 'messenger' | 'twitter' | 'youtube' | 'facebook';

type SimLogEntry = {
  id: number;
  phone: string;
  status: 'sent' | 'pending' | 'failed';
  timestamp: string;
  city: string;
  channel: ChannelId;
};

const WhatsAppLogo = ({ className }: { className?: string }) => <CampaignServiceIcon channel="whatsapp" className={className} />;
const SmsLogo = ({ className }: { className?: string }) => <CampaignServiceIcon channel="sms" className={className} />;
const GmailLogo = ({ className }: { className?: string }) => <CampaignServiceIcon channel="email" className={className} />;
const VoiceLogo = ({ className }: { className?: string }) => <CampaignServiceIcon channel="voice" className={className} />;
// Legacy channel metadata per channel.
// `pending=true` means provider not yet wired — UI shows "בחישוב עלויות".
type ChannelMeta = {
  id: ChannelId;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bgTint: string;
  previewLabel: string;
  unitLabel: string;             // e.g. "להודעה", "לפוסט"
  pending?: boolean;             // pricing not finalized
};

const CHANNELS: Array<ChannelMeta> = [
  { id: 'whatsapp',    label: 'WhatsApp',    icon: WhatsAppLogo, color: 'text-[#25D366]',         bgTint: 'bg-[#25D366]/10 border-[#25D366]/40',                 previewLabel: 'WhatsApp',     unitLabel: 'ישירות לוואטסאפ' },
  { id: 'sms',         label: 'SMS',         icon: SmsLogo,      color: 'text-[#2563EB]',         bgTint: 'bg-[#2563EB]/10 border-[#2563EB]/40',                 previewLabel: 'SMS',          unitLabel: 'להודעה (70 תווים)' },
  { id: 'voice',       label: 'AI קולי',     icon: VoiceLogo,    color: 'text-[hsl(46_78%_58%)]', bgTint: 'bg-[hsl(46_78%_58%)]/10 border-[hsl(46_78%_58%)]/40', previewLabel: 'AI קולי',      unitLabel: 'לדקה' },
  { id: 'ivr',         label: 'IVR',         icon: PhoneCall,    color: 'text-[hsl(262_70%_58%)]', bgTint: 'bg-[hsl(262_70%_58%)]/10 border-[hsl(262_70%_58%)]/40', previewLabel: 'IVR',         unitLabel: 'לדקה' },
  { id: 'email',       label: 'אימייל',      icon: GmailLogo,    color: 'text-[#EA4335]',         bgTint: 'bg-[#EA4335]/10 border-[#EA4335]/40',                 previewLabel: 'אימייל',       unitLabel: 'לנמען' },
  { id: 'linkedin',    label: 'LinkedIn',    icon: Linkedin,     color: 'text-[#0A66C2]',         bgTint: 'bg-[#0A66C2]/10 border-[#0A66C2]/40',                 previewLabel: 'LinkedIn',     unitLabel: 'לפוסט' },
  { id: 'instagram',   label: 'Instagram',   icon: Instagram,    color: 'text-[#E4405F]',         bgTint: 'bg-[#E4405F]/10 border-[#E4405F]/40',                 previewLabel: 'Instagram',    unitLabel: 'לפוסט / ריל' },
  { id: 'tiktok',      label: 'TikTok',      icon: TikTokOfficial, color: 'text-foreground',      bgTint: 'bg-[#FE2C55]/10 border-[#FE2C55]/40',                 previewLabel: 'TikTok',       unitLabel: 'לסרטון' },
  { id: 'telegram',    label: 'Telegram',    icon: TelegramIcon, color: 'text-[#229ED9]',         bgTint: 'bg-[#229ED9]/10 border-[#229ED9]/40',                 previewLabel: 'Telegram',     unitLabel: 'להודעה' },
  { id: 'messenger',   label: 'Messenger',   icon: MessageCircle, color: 'text-[#0084FF]',        bgTint: 'bg-[#0084FF]/10 border-[#0084FF]/40',                 previewLabel: 'Messenger',    unitLabel: 'להודעה' },
  { id: 'twitter',     label: 'X',           icon: Twitter,      color: 'text-foreground',        bgTint: 'bg-foreground/10 border-foreground/40',               previewLabel: 'X',            unitLabel: 'לפוסט' },
  { id: 'youtube',     label: 'YouTube',     icon: Youtube,      color: 'text-[#FF0000]',         bgTint: 'bg-[#FF0000]/10 border-[#FF0000]/40',                 previewLabel: 'YouTube',      unitLabel: 'לסרטון' },
  { id: 'facebook',    label: 'Facebook',    icon: Facebook,     color: 'text-[#1877F2]',         bgTint: 'bg-[#1877F2]/10 border-[#1877F2]/40',                 previewLabel: 'Facebook',     unitLabel: 'לפוסט (Meta)' },
];

// Maps a broadcast channel to the platform key in the social_connections table
// (or to a synthetic 'sms' key resolved against api_configs / 019 SMS provider).
const CHANNEL_TO_PLATFORM: Record<ChannelId, string | null> = {
  whatsapp:    'whatsapp_wba',
  sms:         'sms',
  voice:       null,
  ivr:         null,
  email:       'gmail',
  linkedin:    'linkedin',
  instagram:   'instagram',
  tiktok:      'tiktok',
  telegram:    'telegram',
  messenger:   'fb_messenger',
  twitter:     'twitter',
  youtube:     'youtube',
  facebook:    'facebook',
};

// Channels considered "paid" for the cost calculation. Social channels are free.
const PAID_CHANNELS = new Set<ChannelId>(['sms', 'whatsapp', 'voice', 'email']);

// First 6 channels always visible. Channels 7–12 live behind "אפשרויות נוספות".
// Facebook leads the list with Instagram right next to it.
const CORE_CHANNEL_IDS: ChannelId[] = ['facebook', 'instagram', 'whatsapp', 'sms', 'voice', 'email'];

// Branded sender domain offered for email campaigns.
const EMAIL_SENDER_DOMAIN = 'toraff.co.il';

// Username part of the branded sender address (@toraff.co.il).
const sanitizeEmailAlias = (raw: string) =>
  raw.toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '').slice(0, 32);

const PERSONALIZATION_TAGS = ['[שם_פרטי]', '[עיר]', '[נכס]'];

const DEMO_CITIES = ['ירושלים', 'תל אביב-יפו', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'באר שבע', 'בני ברק', 'חולון', 'רמת גן', 'אשקלון', 'רחובות', 'בת ים', 'הרצליה', 'רמת השרון', 'כפר סבא', 'מודיעין', 'נצרת', 'רעננה', 'לוד'];
const DEMO_TAGS = ['קנייה', 'מכירה', 'שכירות', 'השקעה', 'דירת גן', 'פנטהאוז', 'דופלקס', 'וילה', '3 חדרים', '4 חדרים', '5 חדרים', 'מסחרי'];
const DEMO_LOYALTY = ['חם מאוד', 'חם', 'פושר', 'מתלבט', 'קר', 'לא רלוונטי'];
const DEMO_TOTAL_VOTERS = 12_500;

const BroadcastSchema = z.object({
  blastName: z.string().trim().min(1, 'נא להזין שם קמפיין').max(100, 'שם קמפיין ארוך מדי'),
  messageBody: z.string().trim().min(1, 'נא להזין תוכן הודעה').max(1000, 'תוכן ההודעה ארוך מדי'),
  totalRecipients: z.number().int().min(1).max(10_000_000),
  selectedChannels: z.array(z.enum(['whatsapp', 'sms', 'email', 'voice', 'ivr', 'linkedin', 'instagram', 'tiktok', 'telegram', 'messenger', 'twitter', 'youtube'])).min(1, 'נא לבחור לפחות ערוץ אחד'),
});

const TestPhoneSchema = z.string().trim().regex(/^(05\d-?\d{7}|\+9725\d{8})$/, 'מספר בדיקה חייב להיות בפורמט 05X-XXXXXXX או +9725XXXXXXXX');

function generateFakeLog(total: number, channels: ChannelId[]): SimLogEntry[] {
  const cities = ['ירושלים', 'תל אביב', 'חיפה', 'באר שבע', 'ראשון לציון', 'אשדוד', 'פתח תקווה', 'נתניה', 'רמת השרון'];
  const statuses: SimLogEntry['status'][] = ['sent', 'sent', 'sent', 'sent', 'sent', 'sent', 'sent', 'pending', 'failed'];
  const count = Math.min(total, 200);
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    phone: `9725${Math.floor(Math.random() * 90_000_000) + 10_000_000}`,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    timestamp: new Date(Date.now() - Math.random() * 8000).toLocaleTimeString('he-IL'),
    city: cities[Math.floor(Math.random() * cities.length)],
    channel: channels[i % channels.length] ?? 'sms',
  }));
}

function personalize(message: string) {
  return (message || 'שלום [שם_פרטי], רצינו לעדכן אותך על נכס חדש ב[עיר] שעשוי להתאים לך - [נכס].')
    .replace(/\[שם_פרטי\]/g, 'דניאל')
    .replace(/\[עיר\]/g, 'תל אביב')
    .replace(/\[נכס\]/g, 'דירת 4 חדרים, רוטשילד');
}

export default function SmsBlastSimulator({ onIvrOpen, dedicatedChannel }: { onIvrOpen?: () => void; dedicatedChannel?: 'sms' | 'whatsapp' | 'email' } = {}) {
  const { user } = useAuth();
  const { data: servicePrices = [] } = useCampaignPricing();
  const { limitsEnabled } = useWorkspaceFeatures();
  const blockDemoAction = useDemoGuard();
  const trial = useTrialStatus();
  const { isDemoMode } = useDemoMode();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Lead context (when launched from a single lead's CRM profile) ─────────
  // Drives per-channel gray-out: any channel whose destination coordinate is
  // missing on this lead (e.g. no email → email card disabled) is faded.
  const leadSearchParams = new URLSearchParams(location.search);
  const contextLeadId = leadSearchParams.get('lead') ?? leadSearchParams.get('voter');
  const [leadCoords, setLeadCoords] = useState<{
    phone: boolean; email: boolean; linkedin: boolean; instagram: boolean;
    telegram: boolean; messenger: boolean;
  } | null>(null);
  useEffect(() => {
    if (!contextLeadId) { setLeadCoords(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('phone_number, email, instagram_handle, messenger_id, telegram_username')
        .eq('id', contextLeadId)
        .maybeSingle();
      if (cancelled) return;
      const r: any = data ?? {};
      setLeadCoords({
        phone: !!r.phone_number && /\d{7,}/.test(String(r.phone_number)),
        email: !!r.email && /@/.test(String(r.email)),
        linkedin: false, // no column on leads → always missing for single-lead context
        instagram: !!r.instagram_handle,
        telegram: !!r.telegram_username,
        messenger: !!r.messenger_id,
      });
    })();
    return () => { cancelled = true; };
  }, [contextLeadId]);

  // Returns true when this channel can't possibly reach the targeted lead.
  const leadMissingChannel = useCallback((c: ChannelId): boolean => {
    if (!leadCoords) return false; // bulk mode → don't gate per-lead
    if (c === 'whatsapp' || c === 'sms' || c === 'voice' || c === 'ivr') return !leadCoords.phone;
    if (c === 'email') return !leadCoords.email;
    if (c === 'linkedin') return !leadCoords.linkedin;
    if (c === 'instagram') return !leadCoords.instagram;
    if (c === 'telegram') return !leadCoords.telegram;
    if (c === 'messenger') return !leadCoords.messenger;
    // tiktok / twitter / youtube — no per-lead coord on schema → block in lead context
    return true;
  }, [leadCoords]);


  // ── Live connection map: which channels are actually connected? ───────────
  // Refreshed on mount + whenever the user returns to /campaigns?tab=broadcast
  // after connecting a channel on /social-connect.
  // SMS is always connected: every account routes through the super-admin's
  // shared 019 SMS provider, so end users don't need to configure it themselves.
  const [connectedChannels, setConnectedChannels] = useState<Record<ChannelId, boolean>>({
    whatsapp: false, sms: true, email: false, voice: false, ivr: false,
    linkedin: false, instagram: false, tiktok: false, telegram: false,
    messenger: false, twitter: false, youtube: false, facebook: false,
  });
  // Connected account labels (e.g. "realtyzai@gmail.com") shown under the channel name on each card.
  const [connectedAccounts, setConnectedAccounts] = useState<Partial<Record<ChannelId, string>>>({});
  // True once the connection statuses have been fetched, so the two-step
  // connection screens never flash for users who are already connected.
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const refreshConnectionStatus = useCallback(async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id;
      if (!userId) return;
      const [scRes, apiRes] = await Promise.all([
        // Scope strictly to this user's own connections — the dispatch edge function does the same.
        supabase
          .from('social_connections')
          .select('platform, is_connected, credentials, display_name')
          .eq('created_by', userId),
        supabase.from('api_configs').select('service_name, is_active'),
      ]);
      const sc = (scRes.data ?? []) as Array<{ platform: string; is_connected: boolean; credentials: any; display_name: string | null }>;
      const api = (apiRes.data ?? []) as Array<{ service_name: string; is_active: boolean }>;
      const findSC = (key: string) => sc.find((r) => r.platform === key);
      const apiActive = (names: string[]) => api.some((r) => r.is_active && names.includes(r.service_name));

      // A row counts as "live" when SocialConnect has stamped a verified identity
      // (OAuth completed) OR an OAuth/access token sits on the credentials. We do
      // NOT require manual.access_token because the Google OAuth flow on
      // /social-connect stores its proof under credentials.verified_identity.
      const isLiveGmail = (row?: { is_connected: boolean; credentials: any }) => {
        const creds = row?.credentials ?? {};
        const manual = creds?.manual ?? {};
        return !!(
          creds?.verified_identity?.email ||
          creds?.access_token ||
          manual?.access_token
        );
      };
      const isLiveGeneric = (row?: { is_connected: boolean; credentials: any }) =>
        !!row && (!!row.is_connected || !!row.credentials?.session_token || !!row.credentials?.verified_identity || !!row.credentials?.access_token);

      // Multi-Gmail: collect ALL connected Gmail/Google accounts (not just one)
      const gmailRows = sc.filter((r) => r.platform === 'gmail' || r.platform === 'google');
      const liveGmailRows = gmailRows.filter(isLiveGmail);
      const gmailRow = liveGmailRows[0] ?? gmailRows[0];
      const gmailLive = liveGmailRows.length > 0;
      const gmailAccountCount = liveGmailRows.length;
      const gmailAddresses = liveGmailRows
        .map((r) => r?.credentials?.verified_identity?.email ?? r?.credentials?.account_name ?? r?.display_name)
        .filter(Boolean) as string[];

      const { data: officialProviders } = await supabase.from('wa_providers').select('id').eq('is_official', true).eq('is_active', true).limit(1);
      const waLive = !!officialProviders?.length;

      setConnectedChannels({
        sms:         true,
        whatsapp:    waLive,
        email:       gmailLive,
        voice:       false,
        ivr:         false,
        linkedin:    isLiveGeneric(findSC('linkedin')),
        instagram:   isLiveGeneric(findSC('instagram')) || isLiveGeneric(findSC('facebook')),
        tiktok:      isLiveGeneric(findSC('tiktok')),
        telegram:    isLiveGeneric(findSC('telegram')),
        messenger:   isLiveGeneric(findSC('fb_messenger')) || isLiveGeneric(findSC('facebook')),
        twitter:     isLiveGeneric(findSC('twitter')),
        youtube:     isLiveGeneric(findSC('youtube')),
        facebook:    isLiveGeneric(findSC('facebook')),
      });
      setEmailAccountInfo({ count: gmailAccountCount, addresses: gmailAddresses });
      setConnectedAccounts({
        email: gmailLive
          ? (gmailAccountCount > 1
              ? `${gmailAccountCount} חשבונות (${gmailAddresses[0]} +${gmailAccountCount - 1})`
              : (gmailRow?.credentials?.verified_identity?.email
                  ?? gmailRow?.credentials?.account_name
                  ?? gmailRow?.display_name
                  ?? undefined))
          : undefined,
        whatsapp: waLive ? await getOfficialWaNumber() : undefined,
        sms: undefined,
      });
    } catch (err) {
      console.error('refreshConnectionStatus failed:', err);
    } finally {
      setConnectionsLoaded(true);
    }
  }, []);
  useEffect(() => { refreshConnectionStatus(); }, [refreshConnectionStatus]);

  // Realtime: react instantly when /social-connect writes a new connection
  // (OAuth callback, manual save, identity verification). This avoids the
  // "Connect button still showing after success" bug — no manual refresh needed.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof safeChannel> | null = null;
    (async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id;
      if (!userId || cancelled) return;
      channel = safeChannel(`sms-blast-social-conn-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'social_connections', filter: `created_by=eq.${userId}` },
          () => { refreshConnectionStatus(); },
        )
        .subscribe();
    })();
    // Re-check whenever the tab regains focus — covers the OAuth popup return path.
    const onFocus = () => refreshConnectionStatus();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      if (channel) removeChannelSafe(channel);
    };
  }, [refreshConnectionStatus]);

  // When the user lands back here with ?connected=<platform>, refresh + toast,
  // and clean the URL so reloading doesn't re-fire the message.
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const connected = sp.get('connected');
    if (!connected) return;
    refreshConnectionStatus();
    toast.success(`הערוץ ${connected} חובר בהצלחה - אפשר להמשיך בהפצה`);
    sp.delete('connected');
    navigate({ pathname: location.pathname, search: sp.toString() ? `?${sp.toString()}` : '' }, { replace: true });
  }, [location.search, location.pathname, navigate, refreshConnectionStatus]);

  // Inline reconnect modal state — opened by pre-flight when one or more selected
  // channels lose their connection between page load and Launch click.
  const [reconnectModal, setReconnectModal] = useState<{ open: boolean; channels: ChannelId[] }>({
    open: false,
    channels: [],
  });

  // Click handler for a not-connected channel card — sends the user to
  // /social-connect with both ?connect=<platform> (auto-opens dialog) and
  // ?returnTo=/campaigns?tab=broadcast (so they bounce back here on success).
  const handleConnectChannel = useCallback((channel: ChannelId) => {
    const platform = CHANNEL_TO_PLATFORM[channel];
    if (!platform) {
      toast.info('ערוץ זה עדיין לא זמין לחיבור - בקרוב.');
      return;
    }
    const returnTo = encodeURIComponent(`/campaigns?tab=${channel === 'facebook' ? 'create' : 'broadcast'}&channel=${channel}`);
    navigate(`/social-connect?connect=${platform}&returnTo=${returnTo}`);
  }, [navigate]);

  const [blastName, setBlastName] = useState('');
  // Bulk WhatsApp is business-initiated → Meta requires an approved template.
  const [waTemplate, setWaTemplate] = useState<WaTemplateSelection | null>(null);
  const [messageBody, setMessageBody] = useState('שלום [שם_פרטי], יש לנו נכס חדש ב[עיר] שיכול להתאים לך: [נכס]. נשמח לספר עוד.');
  // Per-channel message overrides — when set, overrides the master messageBody for that channel
  const [channelMessages, setChannelMessages] = useState<Partial<Record<ChannelId, string>>>({});
  const getChannelText = useCallback((channel: ChannelId) => channelMessages[channel] ?? messageBody, [channelMessages, messageBody]);
  const setChannelText = useCallback((channel: ChannelId, value: string) => {
    setChannelMessages((prev) => ({ ...prev, [channel]: value }));
  }, []);
  // Message attachments (any file: image / video / pdf / xlsx / docx / audio etc.)
  type Attachment = { id: string; file: File; previewUrl?: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const addAttachments = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`הקובץ ${file.name} גדול מ־25MB`);
          continue;
        }
        const previewUrl = file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
          ? URL.createObjectURL(file)
          : undefined;
        next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, previewUrl });
      }
      return next;
    });
  }, []);
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);
  // Voice memo recorder (records audio via MediaRecorder and attaches it as a file)
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-memo-${Date.now()}.webm`, { type: 'audio/webm' });
        addAttachments([file]);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      toast.info('מקליט... לחצו שוב לעצירה');
    } catch (err) {
      console.error(err);
      toast.error('לא ניתן לגשת למיקרופון');
      setRecording(false);
    }
  }, [addAttachments]);
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [maxAvailableVoters, setMaxAvailableVoters] = useState(10_000_000);
  const [voterPickerOpen, setVoterPickerOpen] = useState(false);
  const [filterCity, setFilterCity] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLoyalty, setFilterLoyalty] = useState<string>('all');
  const [filterCount, setFilterCount] = useState<number>(0);
  const [filterLoading, setFilterLoading] = useState(false);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [loyaltyOptions, setLoyaltyOptions] = useState<string[]>([]);
  const [recipientSource, setRecipientSource] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<ChannelId[]>(dedicatedChannel ? [dedicatedChannel] : []);
  useEffect(() => {
    if (dedicatedChannel) { setSelectedChannels([dedicatedChannel]); return; }
    const channel = new URLSearchParams(location.search).get('channel');
    if (channel === 'sms' || channel === 'whatsapp' || channel === 'email') setSelectedChannels([channel]);
  }, [location.search, dedicatedChannel]);
  const [showMoreChannels, setShowMoreChannels] = useState(false);
  // Per-channel AI Auto-Reply settings (enabled + tone). Default tone tuned per platform.
  const DEFAULT_AI_TONES: Partial<Record<ChannelId, string>> = {
    whatsapp: 'ידידותי',
    sms: 'תמציתי',
    email: 'מקצועי',
    voice: 'חמים',
    instagram: 'אנרגטי',
    linkedin: 'מקצועי',
    tiktok: 'אנרגטי',
    telegram: 'ידידותי',
  };
  const [aiPerChannel, setAiPerChannel] = useState<Partial<Record<ChannelId, { enabled: boolean; tone: string }>>>({});
  const [humanOversight, setHumanOversight] = useState(true);
  const [voicePayload, setVoicePayload] = useState<VoicePayload | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [dripEnabled, setDripEnabled] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(500);
  const [sendWindowStart, setSendWindowStart] = useState('09:00');
  const [sendWindowEnd, setSendWindowEnd] = useState('20:00');
  const [delayMin, setDelayMin] = useState(7);
  const [delayMax, setDelayMax] = useState(23);
  // ── Email Safe-Sending controls (anti-blacklist) ────────────────────────
  // emailSendRate: how aggressively to throttle the email blast.
  //   'burst' = no throttle (fastest, highest spam-flag risk)
  //   'safe'  = batches of 20 with a 30-120s random delay (default)
  //   'slow'  = batches of 10 with a 60-300s delay (warm-up new accounts)
  // preferResend: routes the blast through Resend's verified domain instead
  // of personal Gmail. Auto-suggested when recipient count > 100.
  const [emailSendRate, setEmailSendRate] = useState<'burst' | 'safe' | 'slow'>('safe');
  const [preferResend, setPreferResend] = useState(false);
  const [emailAccountInfo, setEmailAccountInfo] = useState<{ count: number; addresses: string[] }>({ count: 0, addresses: [] });
  const [resendReady, setResendReady] = useState(false);
  // Dedicated-email sender setup: branded @toraff.co.il alias or connected Gmail.
  const [emailAlias, setEmailAlias] = useState<string | null>(null);
  const [aliasPrefix, setAliasPrefix] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);
  // True once the saved mailbox alias has been fetched.
  const [aliasLoaded, setAliasLoaded] = useState(false);
  // Dedicated-WhatsApp two-step flow: skip the connection screen for now.
  const [waConnectSkipped, setWaConnectSkipped] = useState(false);
  const [phase, setPhase] = useState<'compose' | 'sending' | 'done'>('compose');
  const [sent, setSent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [detailedLog, setDetailedLog] = useState<SimLogEntry[]>([]);
  const [listFileName, setListFileName] = useState<string | null>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const listFileInputRef = useRef<HTMLInputElement>(null);

  const handleListFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('הקובץ גדול מדי (מקסימום 20MB)');
      event.target.value = '';
      return;
    }
    // A row counts as a "valid contact" if it contains at least one cell with
    // a phone-like (>=7 digits) or email-like value. Headers and empty rows
    // are ignored. Returns the actual record count, never an estimate.
    const isContactRow = (cells: unknown[]): boolean => {
      for (const c of cells) {
        const s = String(c ?? '').trim();
        if (!s) continue;
        const digits = s.replace(/\D/g, '');
        if (digits.length >= 7) return true;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true;
      }
      return false;
    };
    try {
      let validCount = 0;
      let totalRows = 0;
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        totalRows = lines.length;
        for (const line of lines) {
          const cells = line.split(/[,;\t]/).map((s) => s.trim());
          if (isContactRow(cells)) validCount++;
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) {
          toast.error('הגיליון הראשון בקובץ ריק');
          event.target.value = '';
          return;
        }
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
        totalRows = rows.length;
        for (const r of rows) {
          if (Array.isArray(r) && isContactRow(r)) validCount++;
        }
      } else {
        toast.error('סוג קובץ לא נתמך. השתמשו ב-CSV, TXT או XLSX');
        event.target.value = '';
        return;
      }
      if (validCount < 1) {
        toast.error('לא נמצאו נמענים תקפים בקובץ', {
          description: 'הקובץ נסרק אך אף שורה לא מכילה מספר טלפון או אימייל תקין.',
        });
        event.target.value = '';
        return;
      }
      const clamped = Math.min(validCount, 10_000_000);
      setTotalRecipients(clamped);
      setListFileName(file.name);
      setRecipientSource('file');
      const skipped = Math.max(0, totalRows - validCount);
      toast.success(`נמצאו ${clamped.toLocaleString('he-IL')} נמענים תקפים בקובץ`, {
        description: skipped > 0 ? `${skipped.toLocaleString('he-IL')} שורות דולגו (כותרות / חסרי טלפון או אימייל)` : undefined,
      });
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בקריאת הקובץ');
    } finally {
      event.target.value = '';
    }
  }, []);

  // Load total lead count + filter options once.
  // Real mode: NEVER seed totalRecipients — the user must explicitly upload a
  // list or pick contacts from the system. Demo data is only injected when
  // demo mode is on.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemoMode) {
        setMaxAvailableVoters(1_000_000);
        setTotalRecipients(DEMO_TOTAL_VOTERS);
        setRecipientSource(`כל הלידים במערכת (${DEMO_TOTAL_VOTERS.toLocaleString('he-IL')})`);
        setFilterCount(DEMO_TOTAL_VOTERS);
        setCityOptions(DEMO_CITIES);
        setTagOptions(DEMO_TAGS);
        setLoyaltyOptions(DEMO_LOYALTY);
        return;
      }
      // Real mode — only learn how many real leads exist (for the picker
      // ceiling). Do NOT auto-fill totalRecipients or recipientSource; those
      // must come from a user action (upload or picker confirm).
      try {
        const { count } = await (supabase as any)
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('is_demo', false);
        if (cancelled) return;
        const total = count ?? 0;
        setMaxAvailableVoters(Math.max(total, 1));
        setFilterCount(0);

        if (total === 0) {
          // Nothing in the user's CRM yet — leave menus empty so the user sees
          // a real empty state instead of demo cities/tags.
          setCityOptions([]);
          setTagOptions([]);
          setLoyaltyOptions([]);
          return;
        }

        const { data: rows } = await (supabase as any)
          .from('leads')
          .select('city, interest_tag, status, loyalty_tier')
          .eq('is_demo', false)
          .limit(5000);
        if (cancelled || !rows) return;
        const uniq = (key: string) => Array.from(new Set(rows.map((r: any) => r?.[key]).filter(Boolean))).sort() as string[];
        // Real mode: use ONLY real values from the user's CRM. If a facet is
        // empty we keep it empty — never substitute demo data.
        setCityOptions(uniq('city'));
        setTagOptions(uniq('interest_tag'));
        setLoyaltyOptions(uniq('loyalty_tier'));
      } catch (err) {
        console.error('Failed to load lead stats', err);
        // On error in real mode keep menus empty — don't expose demo data.
        setCityOptions([]);
        setTagOptions([]);
        setLoyaltyOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isDemoMode]);

  useEffect(() => {
    if (!voterPickerOpen) return;
    let cancelled = false;
    setFilterLoading(true);
    (async () => {
      try {
        if (isDemoMode) {
          // Deterministic pseudo-count from active filters, scaled off the demo total.
          let pct = 1;
          if (filterCity !== 'all') pct *= 0.18;
          if (filterTag !== 'all') pct *= 0.32;
          if (filterStatus !== 'all') pct *= filterStatus === 'active' ? 0.62 : filterStatus === 'inactive' ? 0.28 : 0.1;
          if (filterLoyalty !== 'all') pct *= 0.22;
          const simulated = Math.max(1, Math.round(DEMO_TOTAL_VOTERS * pct));
          if (!cancelled) setFilterCount(simulated);
          return;
        }
        let q: any = (supabase as any).from('leads').select('id', { count: 'exact', head: true }).eq('is_demo', false);
        if (filterCity !== 'all') q = q.eq('city', filterCity);
        if (filterTag !== 'all') q = q.eq('interest_tag', filterTag);
        if (filterStatus !== 'all') q = q.eq('status', filterStatus);
        if (filterLoyalty !== 'all') q = q.eq('loyalty_tier', filterLoyalty);
        const { count } = await q;
        if (!cancelled) setFilterCount(count ?? 0);
      } finally {
        if (!cancelled) setFilterLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [voterPickerOpen, filterCity, filterTag, filterStatus, filterLoyalty, isDemoMode]);

  const applyVoterFilters = useCallback(() => {
    const clamped = Math.min(filterCount, 10_000_000);
    setTotalRecipients(clamped);
    setRecipientSource('picker');
    setListFileName(null);
    setVoterPickerOpen(false);
    toast.success(`נבחרו ${clamped.toLocaleString('he-IL')} לידים מהמערכת`);
  }, [filterCount]);

  const previewText = useMemo(() => personalize(messageBody), [messageBody]);
  const broadcastCost = useMemo(() => {
    const rows = selectedChannels.map((channel) => {
      const meta = CHANNELS.find((item) => item.id === channel);
      const estimate = campaignServiceEstimate(channel, servicePrices, totalRecipients, voicePayload?.durationSec ?? 0);
      return { channel, label: meta?.label ?? channel, unitLabel: estimate.price ? `ל${estimate.price.unit}` : '',
        units: estimate.units, subtotal: estimate.total ?? 0,
        pending: !estimate.price || (estimate.price.unit === 'דקה' && !voicePayload?.durationSec) };
    });
    return { rows, totalCredits: Number(rows.reduce((sum, row) => sum + row.subtotal, 0).toFixed(6)), hasPending: rows.some((row) => row.pending) };
  }, [selectedChannels, servicePrices, totalRecipients, voicePayload?.durationSec]);
  const estimatedCredits = broadcastCost.totalCredits;

  const fireConfetti = useCallback(() => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#1d4ed8', '#0f172a', '#e5e7eb', '#16a34a'],
    });
  }, []);

  const toggleChannel = (channel: ChannelId) => {
    setSelectedChannels((current) => {
      if (current.includes(channel)) return current.filter((item) => item !== channel);
      return [...current, channel];
    });
  };

  const insertTag = (tag: string) => {
    setMessageBody((current) => `${current}${current.endsWith(' ') || current.length === 0 ? '' : ' '}${tag}`);
  };

  const handleTestSend = useCallback(async () => {
    if (!messageBody.trim()) {
      toast.error('נא להזין תוכן הודעה לבדיקה');
      return;
    }
    if (selectedChannels.length === 0) {
      toast.error('נא לבחור ערוץ לבדיקה');
      return;
    }
    const channel = selectedChannels[0];
    const isEmail = channel === 'email';
    const recipient = testPhone.trim();
    if (!recipient) {
      toast.error(isEmail ? 'נא להזין כתובת אימייל לבדיקה' : 'נא להזין מספר טלפון לבדיקה');
      return;
    }
    if (!isEmail) {
      const phone = TestPhoneSchema.safeParse(recipient);
      if (!phone.success) {
        toast.error(phone.error.issues[0]?.message ?? 'מספר בדיקה לא תקין');
        return;
      }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      toast.error('כתובת אימייל לא תקינה');
      return;
    }

    if (isDemoMode) {
      toast.success(`הודעת בדיקה נשלחה בסימולציה אל ${recipient}`);
      return;
    }

    if (channel === 'voice') {
      toast.info('AI קולי - בקרוב. אינטגרציה לספק טרם הופעלה.');
      return;
    }

    if (channel === 'whatsapp' && !waTemplate) { toast.error('בחרו תבנית Meta מאושרת לפני שליחה'); return; }
    toast.loading('שולח הודעת בדיקה...', { id: 'test-send' });
    try {
      const { data, error } = await supabase.functions.invoke('dispatch-campaign', {
        body: {
          mode: 'test',
          channel,
          recipient,
          message: messageBody,
          subject: blastName || 'TORAFF - בדיקה',
          preview_name: user?.user_metadata?.full_name ?? user?.email ?? '',
          wa_template: channel === 'whatsapp' ? waTemplate ?? undefined : undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast.success(`הודעת בדיקה נשלחה בהצלחה אל ${recipient}`, { id: 'test-send' });
      } else {
        toast.error(`כשל בבדיקה: ${(data as any)?.failure_reason ?? 'שגיאה לא ידועה'}`, { id: 'test-send' });
      }
    } catch (e: any) {
      toast.error(`שגיאה בשליחת בדיקה: ${e?.message ?? 'לא ידוע'}`, { id: 'test-send' });
    }
  }, [messageBody, selectedChannels, testPhone, isDemoMode, blastName, waTemplate]);

  // Map UI channels to provider service rows in api_configs
  const channelToProvider: Partial<Record<ChannelId, string[]>> = {
    sms: ['019 SMS'],
    whatsapp: ['Green API', 'WhatsApp Business'],
    email: ['Resend', 'Lovable Emails'],
    voice: ['Voice Provider'],
    linkedin: ['LinkedIn Direct'],
    instagram: ['Meta Graph API'],
    tiktok: ['TikTok Business API'],
    telegram: ['Telegram Bot API'],
    facebook: ['Meta'],
  };

  const startSend = useCallback(async () => {
    const parsed = BroadcastSchema.safeParse({ blastName, messageBody, totalRecipients, selectedChannels });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'נא לבדוק את פרטי הקמפיין');
      return;
    }
    if (!user?.id) {
      toast.error('יש להתחבר לפני שיגור קמפיין');
      return;
    }
    // Trial restriction: block real broadcasts when trial expired
    if (trial.isTrialExpired) {
      toast.error('ההפצה אינה זמינה כרגע בחשבון זה', {
        duration: 8000,
        action: { label: 'שדרג עכשיו', onClick: () => window.location.assign('/wallet') },
      });
      return;
    }

    // === DEMO MODE: keep the original simulation experience ===
    if (isDemoMode) {
      if (blockDemoAction('real-campaign-broadcast')) return;
      setPhase('sending');
      setSent(0);
      setProgress(0);
      startTimeRef.current = Date.now();
      const protectedDailyVolume = dripEnabled ? Math.min(totalRecipients, dailyLimit) : totalRecipients;
      const duration = dripEnabled ? 10000 : 8000;
      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current;
        const pct = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - pct, 3);
        setSent(Math.floor(eased * protectedDailyVolume));
        setProgress(Math.round(eased * 100));
        if (pct < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          setSent(protectedDailyVolume);
          setProgress(100);
          fireConfetti();
          setDetailedLog(generateFakeLog(protectedDailyVolume, selectedChannels));
          setPhase('done');
        }
      };
      animRef.current = requestAnimationFrame(tick);
      return;
    }

    // === REAL MODE: provider gate + balance + lead fetch + per-recipient logging ===
    setPhase('sending');
    setSent(0);
    setProgress(0);

    try {
      // 1) Provider preflight via edge function (uses service-role to read admin-protected api_configs)
      const { data: preflightData, error: preflightErr } = await supabase.functions.invoke('dispatch-campaign', {
        body: { mode: 'preflight' },
      });
      if (preflightErr) {
        toast.error(`שגיאת חיבור: לא ניתן לאמת ספקים (${preflightErr.message ?? 'לא ידוע'})`);
        setPhase('compose');
        return;
      }
      const providerStatus = (preflightData as any)?.providers ?? {};
      providerStatus.whatsapp = connectedChannels.whatsapp && !!waTemplate;
      // Cache Resend availability + multi-Gmail count for the Safe-Sending UI.
      setResendReady(!!(preflightData as any)?.resend_ready);
      const gmailCountFromPreflight = Number((preflightData as any)?.gmail_account_count ?? 0);
      if (gmailCountFromPreflight > 0) {
        setEmailAccountInfo((prev) => ({
          count: gmailCountFromPreflight,
          addresses: ((preflightData as any)?.gmail_accounts ?? []).map((g: any) => g.from).filter(Boolean),
        }));
      }
      const configuredChannelSet = new Set(
        (['sms', 'whatsapp', 'email', 'voice'] as ChannelId[]).filter((c) => providerStatus[c]),
      );
      const missingChannels = selectedChannels.filter(
        (c) => ['sms', 'whatsapp', 'email', 'voice'].includes(c) && !configuredChannelSet.has(c),
      );

      // Inline reconnect modal — never silently abort, never navigate the user away.
      // Lists every selected channel that's not connectable right now and offers a
      // one-click Reconnect that opens the relevant /social-connect dialog.
      if (missingChannels.length > 0) {
        setReconnectModal({ open: true, channels: missingChannels });
        setPhase('compose');
        return;
      }


      // 2) Balance gate (real plans only). get_user_balance returns balance in NIS.
      let balance = 0;
      try {
        const { data: bal } = await supabase.rpc('get_user_balance', { _user_id: user.id });
        balance = Number((bal as any)?.[0]?.balance ?? 0);
      } catch {
        balance = 0;
      }
      // Credit restrictions are disabled for this workspace (broker-recruitment hub):
      // sends are never blocked by balance.
      const insufficientBalance = limitsEnabled && balance > 0 && estimatedCredits > balance * 1000;

      // 3) Pull real recipients from leads table
      const { data: voterRows, error: voterErr } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, city, email')
        .eq('is_demo', false)
        .order('created_at', { ascending: false })
        .limit(Math.min(totalRecipients, 5000));
      if (voterErr) throw voterErr;

      const voters = voterRows ?? [];
      if (voters.length === 0) {
        setPhase('compose');
        toast.error('הרשימה ריקה - ייבאו רשימת מתפקדים לפני שיגור.');
        return;
      }

      // 4) Build per-recipient log rows
      const targetCount = Math.min(voters.length, dripEnabled ? Math.min(totalRecipients, dailyLimit) : totalRecipients);
      const slice = voters.slice(0, targetCount);
      const now = new Date().toISOString();
      const logRows: any[] = [];

      for (const v of slice) {
        for (const channel of selectedChannels) {
          const hasPhone = !!v.phone_number && /^\d{9,15}$/.test(String(v.phone_number).replace(/\D/g, ''));
          const hasEmail = !!(v as any).email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String((v as any).email));
          const needsPhone = channel === 'sms' || channel === 'whatsapp' || channel === 'voice';
          const needsEmail = channel === 'email';
          const providerOk = configuredChannelSet.has(channel);

          let status: string;
          let failure_reason: string | null = null;

          if (channel === 'voice') {
            status = 'pending_provider';
            failure_reason = 'voice_coming_soon';
          } else if (!providerOk) {
            status = 'pending_provider';
            failure_reason = 'provider_not_configured';
          } else if (needsPhone && !hasPhone) {
            status = 'failed';
            failure_reason = 'missing_phone';
          } else if (needsEmail && !hasEmail) {
            status = 'failed';
            failure_reason = 'missing_email';
          } else if (insufficientBalance) {
            status = 'failed';
            failure_reason = 'insufficient_balance';
          } else {
            status = 'queued';
          }

          logRows.push({
            user_id: user.id,
            campaign_name: blastName,
            channel,
            lead_id: v.id,
            recipient_phone: v.phone_number ?? null,
            recipient_email: (v as any).email ?? null,
            recipient_name: v.full_name ?? null,
            message_body: messageBody,
            status,
            failure_reason,
            created_at: now,
          });
        }
      }

      // 5) Insert log rows in batches
      const insertedLog: SimLogEntry[] = [];
      const batchSize = 500;
      for (let i = 0; i < logRows.length; i += batchSize) {
        const batch = logRows.slice(i, i + batchSize);
        const { error: insertErr } = await supabase.from('campaign_logs').insert(batch);
        if (insertErr) throw insertErr;
        const processed = Math.min(i + batch.length, logRows.length);
        setProgress(Math.round((processed / logRows.length) * 50)); // first 50% = enqueue
        setSent(Math.floor(processed / selectedChannels.length));
      }

      // 6) Real dispatch via providers (in batches up to 1000)
      const queuedCount = logRows.filter((r) => r.status === 'queued').length;
      let totalDispatched = 0;
      let totalSucceeded = 0;
      let totalFailed = 0;
      if (queuedCount > 0) {
        // Loop until no more queued rows for this campaign
        for (let safety = 0; safety < 20; safety += 1) {
          // Auto-switch to Resend (verified domain) for high-volume blasts to
          // protect personal Gmail accounts from being flagged as spam.
          const autoPreferResend = preferResend || (selectedChannels.includes('email') && totalRecipients > 100 && resendReady);
          const { data: dispatchData, error: dispatchErr } = await supabase.functions.invoke('dispatch-campaign', {
            body: {
              mode: 'campaign',
              campaign_name: blastName,
              limit: emailSendRate === 'burst' ? 500 : (emailSendRate === 'safe' ? 200 : 100),
              email_send_rate: emailSendRate,
              prefer_resend: autoPreferResend,
              wa_template: selectedChannels.includes('whatsapp') ? waTemplate ?? undefined : undefined,
            },
          });
          if (dispatchErr) {
            console.error('dispatch error', dispatchErr);
            toast.error(`שגיאת שיגור: ${dispatchErr.message ?? 'לא ידוע'}`);
            break;
          }
          const processed = Number((dispatchData as any)?.processed ?? 0);
          totalDispatched += processed;
          totalSucceeded += Number((dispatchData as any)?.succeeded ?? 0);
          totalFailed += Number((dispatchData as any)?.failed ?? 0);
          const ratio = Math.min(totalDispatched / queuedCount, 1);
          setProgress(50 + Math.round(ratio * 50));
          setSent(Math.floor(totalDispatched / Math.max(selectedChannels.length, 1)));
          if (!(dispatchData as any)?.more || processed === 0) break;
        }
      }

      // 7) Build display log (first 200 rows) - re-fetch to reflect provider results
      const { data: finalRows } = await supabase
        .from('campaign_logs')
        .select('id, channel, recipient_phone, status, sent_at, created_at')
        .eq('user_id', user.id)
        .eq('campaign_name', blastName)
        .order('created_at', { ascending: false })
        .limit(200);
      (finalRows ?? []).forEach((r: any, idx: number) => {
        insertedLog.push({
          id: idx + 1,
          phone: r.recipient_phone ?? '-',
          status: r.status === 'sent' ? 'sent' : r.status === 'pending_provider' ? 'pending' : 'failed',
          timestamp: new Date(r.sent_at ?? r.created_at).toLocaleTimeString('he-IL'),
          city: '-',
          channel: r.channel as ChannelId,
        });
      });
      setDetailedLog(insertedLog);

      // 8) Final status messaging
      const pendingProviderCount = logRows.filter((r) => r.status === 'pending_provider').length;
      const failedMissing = logRows.filter((r) => r.failure_reason === 'missing_phone' || r.failure_reason === 'missing_email').length;
      const failedBalance = logRows.filter((r) => r.failure_reason === 'insufficient_balance').length;

      if (missingChannels.length > 0) {
        toast.warning(
          `Pending - חסרים נתוני התחברות לספק: ${missingChannels.map((c) => CHANNELS.find((ch) => ch.id === c)?.label).join(', ')}`,
          { duration: 7000 },
        );
      }
      if (failedBalance > 0) {
        toast.error(`יתרה לא מספקת - ${failedBalance.toLocaleString('he-IL')} שיגורים סומנו ככשל`);
      }
      if (failedMissing > 0) {
        toast.warning(`${failedMissing.toLocaleString('he-IL')} נמענים נכשלו: Failed - Missing Data`);
      }
      if (totalSucceeded > 0) {
        fireConfetti();
        toast.success(`${totalSucceeded.toLocaleString('he-IL')} הודעות נשלחו בהצלחה דרך הספקים`);
      }
      if (totalFailed > 0) {
        toast.error(`${totalFailed.toLocaleString('he-IL')} הודעות נכשלו אצל הספק`);
      }
      if (queuedCount === 0 && pendingProviderCount > 0) {
        toast.warning('אף הודעה לא נשלחה - חסרים נתוני התחברות לספק');
      }

      setProgress(100);
      setPhase('done');
    } catch (err: any) {
      console.error('Real send failed:', err);
      toast.error('שגיאה בשיגור: ' + (err?.message ?? 'שגיאה לא ידועה'));
      setPhase('compose');
    }
  }, [blastName, messageBody, totalRecipients, selectedChannels, blockDemoAction, dripEnabled, dailyLimit, fireConfetti, estimatedCredits, user, isDemoMode, emailSendRate, preferResend, resendReady, trial.isTrialExpired, waTemplate, connectedChannels.whatsapp]);


  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const logStats = useMemo(() => ({
    sent: detailedLog.filter((entry) => entry.status === 'sent').length,
    pending: detailedLog.filter((entry) => entry.status === 'pending').length,
    failed: detailedLog.filter((entry) => entry.status === 'failed').length,
  }), [detailedLog]);

  const progressRadius = 80;
  const circumference = 2 * Math.PI * progressRadius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // ── Email sender setup (dedicated email window) ─────────────────────────
  // Sender must be configured before recipient selection: either a branded
  // @toraff.co.il workspace alias or a connected Gmail account.
  useEffect(() => {
    if (dedicatedChannel !== 'email') return;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_workspace_mailbox' as never);
        const alias = ((data as any)?.alias ?? null) as string | null;
        if (alias) { setEmailAlias(alias); setAliasPrefix(alias); }
      } finally {
        setAliasLoaded(true);
      }
    })();
  }, [dedicatedChannel]);

  const saveAlias = useCallback(async () => {
    const clean = sanitizeEmailAlias(aliasPrefix);
    if (clean.length < 2 || aliasSaving) return;
    setAliasSaving(true);
    try {
      const { error } = await supabase.rpc('set_workspace_email_alias' as never, { p_alias: clean } as never);
      if (error) {
        const m = error.message || '';
        toast.error(
          m.includes('alias_taken') || (error as any).code === '23505' ? 'הכתובת תפוסה, בחרו שם אחר'
          : m.includes('alias_reserved') ? 'כתובת זו שמורה למערכת, בחרו שם אחר'
          : m.includes('only_workspace_owner') ? 'רק בעל מרחב העבודה יכול להגדיר את השולח'
          : m,
        );
        return;
      }
      setEmailAlias(clean);
      toast.success(`השולח הוגדר: ${clean}@${EMAIL_SENDER_DOMAIN}`);
    } finally {
      setAliasSaving(false);
    }
  }, [aliasPrefix, aliasSaving]);

  const senderReady = dedicatedChannel !== 'email' || !!emailAlias || emailAccountInfo.count > 0;

  // Two-step flow for the dedicated WhatsApp window: a clean connection screen
  // first, with an "I'll connect later" link to proceed straight to setup.
  if (dedicatedChannel === 'whatsapp' && phase === 'compose' && connectionsLoaded && !connectedChannels.whatsapp && !waConnectSkipped) {
    return (
      <section dir="rtl" className="mx-auto w-full max-w-3xl space-y-4 text-right">
        <Button type="button" className="h-12 w-full gap-2 bg-[#25D366] text-base font-semibold text-white hover:bg-[#25D366]/90" onClick={() => handleConnectChannel('whatsapp')}>
          <MessageCircle className="h-5 w-5 text-white" />
          חיבור באמצעות וואטסאפ
        </Button>
        <Button type="button" variant="link" className="w-full" onClick={() => setWaConnectSkipped(true)}>אתחבר יותר מאוחר</Button>
      </section>
    );
  }

  // Two-step flow for the dedicated email window: sender configuration must be
  // completed before recipient selection is reachable.
  if (dedicatedChannel === 'email' && phase === 'compose' && connectionsLoaded && aliasLoaded && !senderReady) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6" dir="rtl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-center">הגדרת שולח ההודעות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label>כתובת דומיין TORAFF</Label>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/50">
                <Input value={aliasPrefix} onChange={(e) => setAliasPrefix(e.target.value)} placeholder="office" dir="ltr" className="h-11 flex-1 rounded-none border-0 text-left font-mono text-base focus-visible:ring-0 focus-visible:ring-offset-0" />
                <div className="flex items-center border-r border-border bg-muted/60 px-3 font-mono text-sm" dir="ltr">@{EMAIL_SENDER_DOMAIN}</div>
              </div>
              <Button type="button" className="w-full" disabled={sanitizeEmailAlias(aliasPrefix).length < 2 || aliasSaving} onClick={() => void saveAlias()}>
                {aliasSaving ? 'שומר…' : 'שמור כתובת שולח'}
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3 text-center">
              <Label className="block">או חיבור Gmail אישי</Label>
              <Button type="button" variant="outline" className="w-full gap-2" onClick={() => handleConnectChannel('email')}>
                <Mail className="h-4 w-4" />
                התחברות עם Google
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">יש להשלים את הגדרת השולח לפני בחירת נמענים.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">

      {phase === 'compose' && (
        <div className={dedicatedChannel ? 'mx-auto w-full max-w-3xl' : 'grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]'}>
          <div className="space-y-6">
            {!dedicatedChannel && <Card className="mt-5">
              <CardHeader>
                <CardTitle className="text-base text-center">
                  בחירת ערוצים להפצה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const coreChannels = CHANNELS.filter((c) => CORE_CHANNEL_IDS.includes(c.id));
                  const moreChannels = CHANNELS.filter((c) => !CORE_CHANNEL_IDS.includes(c.id));
                  const hiddenSelectedCount = moreChannels.filter((c) => selectedChannels.includes(c.id)).length;

                  const renderCard = (channel: ChannelMeta) => {
                    const Icon = channel.icon;
                    const checked = selectedChannels.includes(channel.id);
                    const isConnected = connectedChannels[channel.id];
                    const configuredPrice = campaignServicePrice(channel.id, servicePrices);
                    const isPending = !configuredPrice;
                    const isFree = configuredPrice?.credits === 0;
                    // Dual gray-out conditions (hard-disable both):
                    //   (1) Provider not connected at brokerage level (e.g. WhatsApp instance not linked).
                    //   (2) In lead-context mode, the lead has no destination coord (no email/phone/handle).
                    const missingForLead = leadMissingChannel(channel.id);
                    const disabledForLead = !!contextLeadId && missingForLead;
                    const disabledForIntegration = !isConnected && !isPending && !(channel.id === 'ivr' && onIvrOpen);
                    const isHardDisabled = disabledForLead || disabledForIntegration;
                    const priceText = configuredPrice ? formatCampaignCredits(configuredPrice.credits) : 'המחירון אינו זמין';
                    const handleCardClick = () => {
                      if (channel.id === 'ivr' && onIvrOpen && !disabledForLead) { onIvrOpen(); return; }
                      if (disabledForLead) {
                        toast.info('לליד זה אין כתובת/מספר מתאים לערוץ זה.');
                        return;
                      }
                      if (isPending) {
                        toast.info('ערוץ זה ממתין לחיבור ספק - נחזור בקרוב.');
                        return;
                      }
                      if (!isConnected) {
                        // Brokerage integration missing - block selection entirely.
                        toast.info('ערוץ זה אינו מחובר בהגדרות המשרד. יש לחבר אותו תחילה.');
                        return;
                      }
                      toggleChannel(channel.id);
                    };
                    const disabledTitle = disabledForLead
                      ? 'אין יעד זמין לליד זה בערוץ הזה'
                      : disabledForIntegration
                        ? 'הערוץ אינו מחובר בהגדרות המשרד'
                        : undefined;
                    return (
                      <Button
                        variant="ghost"
                        key={channel.id}
                        type="button"
                        onClick={handleCardClick}
                        aria-pressed={checked}
                        aria-disabled={isHardDisabled}
                        title={disabledTitle}
                        className={`relative flex flex-col items-center justify-start gap-1.5 rounded-xl border-2 p-2.5 sm:p-3 text-center transition-all h-auto min-h-[8.75rem] whitespace-normal ${
                          isHardDisabled
                            ? 'opacity-40 pointer-events-none border-dashed border-border/60 bg-muted/30'
                            : checked
                              ? 'border-primary bg-primary/10 shadow-[0_4px_18px_-6px_hsl(var(--primary)/0.55)] ring-1 ring-primary/30'
                              : isConnected
                                ? 'border-border bg-card hover:border-primary/40 hover:bg-secondary/40'
                                : 'border-dashed border-border/70 bg-muted/30 hover:border-primary/30 hover:bg-muted/50'
                        }`}
                      >


                        {checked && isConnected && (
                          <span
                            className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                            aria-label="נבחר"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                        )}

                        {checked && isConnected && aiPerChannel[channel.id]?.enabled && (
                          <span
                            className="absolute top-2 left-2 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm"
                            aria-label="AI פעיל"
                            title={`Auto-Pilot · ${aiPerChannel[channel.id]?.tone ?? ''}`}
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}

                        <CampaignServiceIcon channel={channel.id} className="h-7 w-7 sm:h-8 sm:w-8" />

                        <span className="font-semibold text-foreground text-[12.5px] sm:text-sm leading-tight truncate max-w-full">
                          {channel.label}
                        </span>

                        {isConnected && connectedAccounts[channel.id] && (
                          <span
                            className="inline-flex items-center gap-1 max-w-full text-[10px] sm:text-[10.5px] font-medium leading-tight text-emerald-700 dark:text-emerald-400 truncate"
                            title={connectedAccounts[channel.id]}
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                            <span className="truncate">{connectedAccounts[channel.id]}</span>
                          </span>
                        )}

                        <span
                          className={`text-[11px] font-medium tabular-nums leading-tight ${
                            isPending
                              ? 'text-amber-600 dark:text-amber-400 italic'
                              : isFree
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-foreground'
                          }`}
                        >
                          {priceText}
                        </span>

                        <span className="text-[10px] sm:text-[10.5px] text-muted-foreground leading-tight truncate max-w-full">
                          {configuredPrice ? `ל${configuredPrice.unit}` : channel.unitLabel}
                        </span>

                        {!isConnected && !isPending && (
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); handleConnectChannel(channel.id); }}
                            className="mt-auto inline-flex w-full items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-1 text-[10px] sm:text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Plug className="h-3 w-3" />
                            חבר
                          </span>
                        )}

                        {checked && isConnected && (() => {
                          const ai = aiPerChannel[channel.id] ?? { enabled: false, tone: DEFAULT_AI_TONES[channel.id] ?? 'ידידותי' };
                          const setAi = (next: { enabled: boolean; tone: string }) =>
                            setAiPerChannel((prev) => ({ ...prev, [channel.id]: next }));
                          const TONES = ['ידידותי', 'מקצועי', 'תמציתי', 'אנרגטי', 'חמים'];
                          return (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`mt-auto flex w-full items-center justify-between gap-1 rounded-md border px-1.5 py-1 transition-colors ${
                                ai.enabled
                                  ? 'border-violet-400/60 bg-violet-500/10'
                                  : 'border-border/60 bg-muted/40'
                              }`}
                            >
                              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[10.5px] font-semibold">
                                <Sparkles className={`h-3 w-3 ${ai.enabled ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}`} />
                                <span className={ai.enabled ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground'}>מענה AI</span>
                              </span>
                              <div className="flex items-center gap-1">
                                {ai.enabled && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <span
                                        role="button"
                                        tabIndex={-1}
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                                        aria-label="הגדרות AI"
                                        title="הגדרות טון"
                                      >
                                        <Settings2 className="h-3 w-3" />
                                      </span>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      side="top"
                                      align="end"
                                      className="w-56 p-3 space-y-2"
                                      onClick={(e) => e.stopPropagation()}
                                      dir="rtl"
                                    >
                                      <div className="text-xs font-semibold text-foreground">טון מענה ל-{channel.label}</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {TONES.map((t) => (
                                          <button
                                            key={t}
                                            type="button"
                                            onClick={() => setAi({ enabled: true, tone: t })}
                                            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                                              ai.tone === t
                                                ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                                                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                            }`}
                                          >
                                            {t}
                                          </button>
                                        ))}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground leading-tight">
                                        ה-AI ישיב באופן אוטומטי בערוץ זה לפי הטון הנבחר.
                                      </p>
                                    </PopoverContent>
                                  </Popover>
                                )}
                                <Switch
                                  checked={ai.enabled}
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={(v) => setAi({ enabled: v, tone: ai.tone })}
                                  className="scale-75 data-[state=checked]:bg-violet-500"
                                  aria-label="הפעל מענה AI לערוץ"
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </Button>
                    );
                  };

                  return (
                    <>
                      {/* The Big 3 — always visible */}
                      <div className="grid gap-2.5 sm:gap-3 grid-cols-3">
                        {coreChannels.map(renderCard)}
                      </div>

                      {/* Show More toggle */}
                      <button
                        type="button"
                        onClick={() => setShowMoreChannels((v) => !v)}
                        aria-expanded={showMoreChannels}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[12px] sm:text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                      >
                        <span>אפשרויות נוספות</span>
                        {!showMoreChannels && hiddenSelectedCount > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold bg-primary/15 text-primary border-primary/30">
                            {hiddenSelectedCount} ערוצים נוספים נבחרו
                          </Badge>
                        )}
                        <ChevronDown className={`h-4 w-4 transition-transform ${showMoreChannels ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Expandable drawer */}
                      <AnimatePresence initial={false}>
                        {showMoreChannels && (
                          <motion.div
                            key="more-channels"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="overflow-hidden"
                          >
                            <div className="grid gap-2.5 sm:gap-3 grid-cols-3 pt-1">
                              {moreChannels.map(renderCard)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  );
                })()}
              </CardContent>
            </Card>}

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-center">בחירת נמענים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <input
                      ref={listFileInputRef}
                      type="file"
                      accept=".csv,.txt,.xlsx,.xls"
                      className="hidden"
                      onChange={handleListFileUpload}
                    />
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setVoterPickerOpen(true)}
                      >
                        <Users className="ml-1 h-3.5 w-3.5" />
                        בחירה מהמערכת
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => listFileInputRef.current?.click()}
                      >
                        <FileSpreadsheet className="ml-1 h-3.5 w-3.5 text-[#107C41]" />
                        העלאת רשימה
                      </Button>
                    </div>
                    {totalRecipients > 0 && (listFileName || recipientSource) && (
                      <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-3 text-center" dir="rtl">
                        <div className="text-2xl font-bold text-primary tabular-nums">
                          {totalRecipients.toLocaleString('he-IL')}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {listFileName
                            ? 'נמענים תקפים מהרשימה שהועלתה'
                            : 'נמענים שנבחרו במערכת'}
                        </div>
                        {listFileName && (
                          <div className="mt-2 truncate text-xs text-muted-foreground/80" title={listFileName}>
                            {listFileName}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Input value={blastName} onChange={(event) => setBlastName(event.target.value)} placeholder="שם הקמפיין" maxLength={100} />
                </div>

                {selectedChannels.includes('whatsapp') && (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <p className="text-xs text-blue-800">
                      Meta חוסמת הודעות חופשיות ביוזמת העסק. השיגור יתבצע בתבנית מאושרת, ונמענים שביקשו הסרה
                      (Opt-out) יידלגו אוטומטית.
                    </p>
                    <WaTemplatePicker value={waTemplate} onChange={setWaTemplate} campaignOnly />
                  </div>
                )}

                <div className="space-y-2">
                  <Textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} rows={6} maxLength={1000} placeholder="תוכן ההודעה" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">תגיות התאמה אישית</span>
                      {PERSONALIZATION_TAGS.map((tag) => (
                        <Button key={tag} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => insertTag(tag)}>{tag}</Button>
                      ))}
                    </div>
                    <span dir="ltr">{messageBody.length}/1000</span>
                  </div>

                  {/* Attachments toolbar */}
                  <input
                    ref={attachInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) addAttachments(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => attachInputRef.current?.click()}
                    >
                      <Paperclip className="ml-1 h-3.5 w-3.5" />
                      צרף קובץ
                    </Button>
                    {recording ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs animate-pulse"
                        onClick={stopRecording}
                      >
                        <StopCircle className="ml-1 h-3.5 w-3.5" />
                        עצור הקלטה
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={startRecording}
                      >
                        <Mic className="ml-1 h-3.5 w-3.5" />
                        הקלט הודעה קולית
                      </Button>
                    )}
                  </div>

                  {/* Attachment previews */}
                  {attachments.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {attachments.map((att) => {
                        const type = att.file.type;
                        const isImg = type.startsWith('image/');
                        const isVid = type.startsWith('video/');
                        const isAud = type.startsWith('audio/');
                        const sizeKB = (att.file.size / 1024).toFixed(0);
                        return (
                          <div
                            key={att.id}
                            className="group relative flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2"
                          >
                            <button
                              type="button"
                              onClick={() => removeAttachment(att.id)}
                              className="absolute -top-2 -left-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow hover:bg-destructive/90"
                              aria-label="הסר קובץ"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-background">
                              {isImg && att.previewUrl ? (
                                <img src={att.previewUrl} alt={att.file.name} className="h-full w-full object-cover" />
                              ) : isVid && att.previewUrl ? (
                                <video src={att.previewUrl} className="h-full w-full object-cover" muted />
                              ) : isAud && att.previewUrl ? (
                                <audio controls src={att.previewUrl} className="h-8 w-full" />
                              ) : isImg ? (
                                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                              ) : isVid ? (
                                <Film className="h-8 w-8 text-muted-foreground" />
                              ) : (
                                <FileText className="h-8 w-8 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium" title={att.file.name}>{att.file.name}</p>
                              <p className="text-[10px] text-muted-foreground">{sizeKB} KB</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedChannels.includes('voice') && (
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold text-primary">יצירת הודעה קולית</span>
                      </div>
                      <span className="text-xs font-semibold text-primary">
                        {(() => { const price = campaignServicePrice('voice', servicePrices); return price ? `${formatCampaignCredits(price.credits)} ל${price.unit}` : 'המחירון אינו זמין'; })()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">בחרו אחת מ-3 דרכים: AI טקסט לדיבור, העלאת קובץ, או הקלטה ישירה.</p>
                    <VoiceComposer value={voicePayload} onChange={setVoicePayload} />
                  </div>
                )}

                {selectedChannels.length > 0 && (
                  <div className={dedicatedChannel ? 'space-y-4' : 'grid gap-4 lg:grid-cols-2'}>
                    {selectedChannels.includes('sms') && (
                      <Card className="border-social-sms/25 bg-social-sms/5">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <SmsLogo className="h-4 w-4 text-social-sms" /> תצוגת מסרון
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Textarea
                            value={getChannelText('sms')}
                            onChange={(event) => setChannelText('sms', event.target.value)}
                            rows={4}
                            maxLength={1000}
                            className="bg-background"
                            placeholder="הודעה ייעודית למסרון..."
                          />
                          <div className="rounded-md border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground" dir="rtl">
                            {personalize(getChannelText('sms'))}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">טקסט רגיל · {Math.ceil(personalize(getChannelText('sms')).length / 160) || 1} סגמנטים</p>
                        </CardContent>
                      </Card>
                    )}

                    {selectedChannels.includes('voice') && (
                      <Card className="border-primary/25 bg-primary/5">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm"><AudioLines className="h-4 w-4 text-[hsl(46_78%_58%)]" /> תצוגת AI קולי</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm text-foreground" dir="rtl">
                            <Mic className="h-5 w-5 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                              {voicePayload ? (
                                <>
                                  <p className="truncate font-semibold">
                                    {voicePayload.source === 'tts' ? 'AI טקסט לדיבור' : voicePayload.source === 'upload' ? voicePayload.fileName ?? 'קובץ אודיו' : 'הקלטה ידנית'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {voicePayload.durationSec} שניות · {Math.ceil(voicePayload.durationSec * totalRecipients / 60).toLocaleString('he-IL')} דקות סה"כ
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground">בחרו תוכן בהרכבת ההודעה הקולית למעלה</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Global AI Auto-Pilot summary + Human Oversight gate */}
                {selectedChannels.some((c) => aiPerChannel[c]?.enabled) && (
                  <Card className="border-violet-400/40 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-2 min-w-0">
                          <Sparkles className="h-4 w-4 mt-0.5 text-violet-600 dark:text-violet-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">מענה AI אוטומטי פעיל</div>
                            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                              ערוצי Auto-Pilot:{' '}
                              {selectedChannels
                                .filter((c) => aiPerChannel[c]?.enabled)
                                .map((c) => `${CHANNELS.find((ch) => ch.id === c)?.label} (${aiPerChannel[c]?.tone})`)
                                .join(' · ')}
                            </div>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 cursor-pointer">
                          <Shield className={`h-3.5 w-3.5 ${humanOversight ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                          <span className="text-[11.5px] font-medium text-foreground leading-tight">
                            העבר לטיפול אנושי אם הליד כועס
                          </span>
                          <Switch
                            checked={humanOversight}
                            onCheckedChange={setHumanOversight}
                            className="scale-75 data-[state=checked]:bg-emerald-500"
                            aria-label="פיקוח אנושי על שיחות שליליות"
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <DeliverySettings enabled={dripEnabled} onEnabledChange={setDripEnabled} dailyLimit={dailyLimit} onDailyLimitChange={setDailyLimit} windowStart={sendWindowStart} onWindowStartChange={setSendWindowStart} windowEnd={sendWindowEnd} onWindowEndChange={setSendWindowEnd} delayMin={delayMin} onDelayMinChange={setDelayMin} delayMax={delayMax} onDelayMaxChange={setDelayMax} testPhone={testPhone} onTestPhoneChange={setTestPhone} onTestSend={handleTestSend} />

                <div className="flex flex-col gap-3 rounded-md border border-primary/15 bg-card p-3 shadow-lg">
                  <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">עלות משוערת לקמפיין</span>
                      <span className="text-base font-bold tabular-nums text-foreground">
                        {formatCampaignCredits(broadcastCost.totalCredits)}
                      </span>
                    </div>
                    {broadcastCost.rows.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-muted-foreground">
                        {broadcastCost.rows.map((r) => (
                          <li key={r.channel} className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1"><CampaignServiceIcon channel={r.channel} />{r.label} · {r.units.toLocaleString('he-IL')} {r.unitLabel}</span>
                            <span className="tabular-nums">
                              {r.pending ? <span className="italic text-amber-600 dark:text-amber-400">בחישוב עלויות</span> : formatCampaignCredits(r.subtotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {broadcastCost.hasPending && (
                      <p className="mt-1 text-[10px] italic text-amber-600 dark:text-amber-400">* העלות תושלם לאחר טעינת המחירון ואורך ההקלטה.</p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    {(() => {
                      const hasConnectedSelected = selectedChannels.some((c) => connectedChannels[c]);
                      const trialBlocked = trial.isTrialExpired;
                      const disabled = (selectedChannels.includes('whatsapp') && !waTemplate) || broadcastCost.hasPending || !blastName.trim() || !messageBody.trim() || selectedChannels.length === 0 || !hasConnectedSelected || trialBlocked;
                      return (
                        <>
                          <Button size="lg" className="h-auto whitespace-normal text-center bg-primary text-primary-foreground hover:bg-primary-glow" onClick={() => setConfirmOpen(true)} disabled={disabled}>
                            <Send className="h-4 w-4 ml-1" />
                            שליחה ל-{totalRecipients.toLocaleString('he-IL')} נמענים בעלות משוערת של {formatCampaignCredits(broadcastCost.totalCredits)}
                          </Button>
                          {trialBlocked && (
                            <p className="text-[11px] text-destructive">
                              ההפצה אינה זמינה כרגע בחשבון זה
                            </p>
                          )}
                          {!trialBlocked && selectedChannels.length > 0 && !hasConnectedSelected && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">
                              נא לבחור לפחות ערוץ אחד מחובר כדי להפעיל את כפתור השליחה
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>

            
          </div>

          {!dedicatedChannel && <CreditBalanceWidget />}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <div className="space-y-2">{broadcastCost.rows.map((row) => <div key={row.channel} className="flex items-center justify-between gap-2 text-xs"><span className="inline-flex items-center gap-2"><CampaignServiceIcon channel={row.channel} />{row.label}</span><span>{formatCampaignCredits(row.subtotal)}</span></div>)}</div>
          <AlertDialogHeader>
            <AlertDialogTitle>אישור שיגור חי</AlertDialogTitle>
            <AlertDialogDescription>
              שליחה ל-{totalRecipients.toLocaleString('he-IL')} נמענים בעלות משוערת של {formatCampaignCredits(broadcastCost.totalCredits)}.
              <br />
              קמפיין &quot;{blastName || 'ללא שם'}&quot; · ערוצים: {selectedChannels.map((c) => CHANNELS.find((ch) => ch.id === c)?.label).join(', ')}.
              <br />
              <span className="font-bold text-destructive">פעולה זו אינה ניתנת לביטול.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); startSend(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              אישור ושיגור חי
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pre-flight inline reconnect modal — opened when one or more selected
          channels lost their connection between page load and the Launch click. */}
      <Dialog
        open={reconnectModal.open}
        onOpenChange={(open) => setReconnectModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>נדרש חיבור מחדש לפני השיגור</DialogTitle>
            <DialogDescription>
              הערוצים הבאים אינם מחוברים או שתוקף ההזדהות פג. חברו אותם מחדש כדי להמשיך.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {reconnectModal.channels.map((c) => {
              const meta = CHANNELS.find((ch) => ch.id === c);
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div
                  key={c}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 ${meta.color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c === 'email'
                          ? 'יש לחבר חשבון Gmail בדף החיבורים'
                          : c === 'whatsapp'
                            ? 'יש להזין Instance ID + API Token של WBA'
                            : 'נדרש חיבור ספק'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReconnectModal({ open: false, channels: [] });
                      handleConnectChannel(c);
                    }}
                  >
                    <Plug className="h-3.5 w-3.5 ml-1" />
                    חבר עכשיו
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReconnectModal({ open: false, channels: [] })}
            >
              סגירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voterPickerOpen} onOpenChange={setVoterPickerOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>בחירת לידים מהמערכת</DialogTitle>
            <DialogDescription>סננו לפי עיר, תגית עניין, סטטוס ונאמנות. ברירת המחדל היא כלל הלידים.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">עיר</Label>
              <Select value={filterCity} onValueChange={setFilterCity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הערים</SelectItem>
                  {cityOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">תגית עניין</Label>
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל התגיות</SelectItem>
                  {tagOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">סטטוס</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="active">פעיל</SelectItem>
                  <SelectItem value="inactive">לא פעיל</SelectItem>
                  <SelectItem value="opted_out">ויתר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">נאמנות</Label>
              <Select value={filterLoyalty} onValueChange={setFilterLoyalty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הרמות</SelectItem>
                  {loyaltyOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md bg-primary/5 p-3 text-center text-sm">
            {filterLoading ? 'מחשב...' : (
              <>נמצאו <span className="font-bold text-primary">{filterCount.toLocaleString('he-IL')}</span> לידים תואמים</>
            )}
          </div>
          <DialogFooter>
            
            <Button onClick={applyVoterFilters} disabled={filterCount < 1 || filterLoading}>מכירה ({filterCount.toLocaleString('he-IL')})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {phase === 'sending' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-8">
              <div className="relative">
                <svg width="180" height="180" className="-rotate-90 transform">
                  <circle cx="90" cy="90" r={progressRadius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                  <circle cx="90" cy="90" r={progressRadius} fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-[stroke-dashoffset] duration-100" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Zap className="mb-1 h-6 w-6 animate-pulse text-primary" />
                  <span className="text-2xl font-bold text-foreground">{progress}%</span>
                </div>
              </div>
              <div className="space-y-2 text-center">
                <p className="text-lg font-medium text-foreground">משגר: <span className="font-bold text-primary">{sent.toLocaleString()}</span> / {totalRecipients.toLocaleString()}</p>
                <div className="h-3 w-80 max-w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-100" style={{ width: `${progress}%` }} />
                </div>
                <p className="animate-pulse text-sm text-muted-foreground">מעבד בצ&apos;אנקים...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'done' && (
        <div className="animate-fade-in space-y-6">
          <Card className="success-glow">
            <CardContent className="py-10">
              <div className="flex flex-col items-center gap-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 animate-scale-in">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-1 text-center">
                  <h2 className="text-2xl font-bold text-foreground">
                    {isDemoMode ? 'סימולציית שיגור הושלמה' : 'שיגור נרשם במאגר'}
                  </h2>
                  <p className="text-muted-foreground">
                    {isDemoMode
                      ? 'הקמפיין נבדק בהצלחה - אף הודעה אמיתית לא נשלחה'
                      : 'כל נמען נרשם בטבלת campaign_logs עם סטטוס אמיתי (queued / pending_provider / failed).'}
                  </p>
                </div>
                <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
                  <SummaryBox icon={<Users className="h-5 w-5 text-primary" />} value={totalRecipients.toLocaleString()} label="נמענים" />
                  <SummaryBox icon={<MessageSquare className="h-5 w-5 text-primary-glow" />} value={selectedChannels.length.toString()} label="ערוצים" />
                  <SummaryBox icon={<Coins className="h-5 w-5 text-success" />} value={formatCampaignCredits(estimatedCredits)} label="עלות משוערת" />
                  <SummaryBox icon={<Shield className="h-5 w-5 text-warning" />} value={isDemoMode ? 'הדגמה' : 'ייצור'} label="סטטוס" />
                </div>
              </div>
            </CardContent>
          </Card>

          <DetailedLogTable detailedLog={detailedLog} totalRecipients={totalRecipients} logStats={logStats} />

          <div className="flex justify-center">
            <Button variant="outline" onClick={() => { setPhase('compose'); setSent(0); setProgress(0); setBlastName(''); setDetailedLog([]); }}>
              קמפיין חדש
            </Button>
          </div>
        </div>
      )}

      {!dedicatedChannel && <CampaignHistoryTable />}
    </div>
  );
}

function CreditBalanceWidget() {
  const { data: wallet, isLoading, isError } = useCreditWallet();
  const { data: prices = [] } = useCampaignPricing();
  const navigate = useNavigate();
  return <Card className="h-fit xl:sticky xl:top-20">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4 text-primary" />יתרת קרדיטים</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-lg font-bold">{isLoading ? 'טוען…' : isError ? 'היתרה אינה זמינה' : formatCampaignCredits(ilsToCredits(wallet?.balance ?? 0))}</p>
      {['whatsapp', 'sms', 'ivr', 'email'].map((channel) => {
        const price = campaignServicePrice(channel, prices);
        return <div key={channel} className="flex items-center justify-between gap-2 text-xs"><CampaignServiceIcon channel={channel} /><span>{channel === 'whatsapp' ? 'WhatsApp הרשמי' : channel.toUpperCase()}</span><span>{price ? `${formatCampaignCredits(price.credits)} ל${price.unit}` : 'המחירון אינו זמין'}</span></div>;
      })}
      <Button className="w-full" onClick={() => navigate('/wallet')}>טעינת קרדיטים</Button>
    </CardContent>
  </Card>;
}

function CreditLine({ icon, label, value, note, pct, barClass = 'bg-primary' }: { icon: React.ReactNode; label: string; value: string; note: string; pct: number; barClass?: string }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-foreground">{icon}{label}</div>
        <span className="text-sm font-bold text-primary" dir="ltr">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" dir="ltr">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

type CampaignSummary = {
  campaign_name: string;
  channels: string[];
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  last_at: string;
};

type CampaignLogRow = {
  id: string;
  channel: string;
  recipient_phone: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  status: string;
  failure_reason: string | null;
  message_body: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
};

function CampaignHistoryTable() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<CampaignLogRow[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CampaignLogRow | null>(null);

  const loadSummaries = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('campaign_logs')
      .select('campaign_name, channel, status, created_at, sent_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error || !data) {
      setLoading(false);
      return;
    }
    const map = new Map<string, CampaignSummary>();
    for (const row of data as any[]) {
      const name = row.campaign_name ?? '(ללא שם)';
      const cur = map.get(name) ?? {
        campaign_name: name,
        channels: [] as string[],
        recipients: 0,
        sent: 0,
        failed: 0,
        pending: 0,
        last_at: row.created_at,
      };
      cur.recipients += 1;
      if (row.status === 'sent') cur.sent += 1;
      else if (row.status === 'failed') cur.failed += 1;
      else cur.pending += 1;
      if (!cur.channels.includes(row.channel)) cur.channels.push(row.channel);
      const ts = row.sent_at ?? row.created_at;
      if (ts && ts > cur.last_at) cur.last_at = ts;
      map.set(name, cur);
    }
    const list = Array.from(map.values()).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
    setSummaries(list);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadSummaries();
    const onFocus = () => loadSummaries();
    window.addEventListener('focus', onFocus);
    const t = setInterval(loadSummaries, 15_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(t);
    };
  }, [loadSummaries]);

  const openDetails = useCallback(
    async (campaign: string) => {
      if (!user?.id) return;
      setOpenCampaign(campaign);
      setOpenLoading(true);
      const { data } = await (supabase as any)
        .from('campaign_logs')
        .select('id, channel, recipient_phone, recipient_email, recipient_name, status, failure_reason, message_body, provider_message_id, sent_at, created_at')
        .eq('user_id', user.id)
        .eq('campaign_name', campaign)
        .order('created_at', { ascending: false })
        .limit(500);
      setOpenRows((data as CampaignLogRow[]) ?? []);
      setOpenLoading(false);
    },
    [user?.id],
  );

  const channelLabel = (c: string) => {
    const found = CHANNELS.find((ch) => ch.id === c);
    return found?.label ?? c;
  };

  const statusBadge = (s: string) => {
    if (s === 'sent') return <Badge className="border-success/50 bg-success/10 text-success" variant="outline">נשלח</Badge>;
    if (s === 'failed') return <Badge className="border-destructive/50 bg-destructive/10 text-destructive" variant="outline">נכשל</Badge>;
    if (s === 'queued') return <Badge className="border-primary/50 bg-primary/10 text-primary" variant="outline">בתור</Badge>;
    if (s === 'pending_provider') return <Badge className="border-warning/50 bg-warning/10 text-warning" variant="outline">ממתין לספק</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>היסטוריית קמפיינים</span>
          {!loading && summaries.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{summaries.length} קמפיינים</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">טוען היסטוריה...</p>
        ) : summaries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">אין שיגורים עדיין. שגרו קמפיין כדי לראות אותו כאן.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">שם קמפיין</TableHead>
                  <TableHead className="text-xs">ערוצים</TableHead>
                  <TableHead className="text-xs">נמענים</TableHead>
                  <TableHead className="text-xs">נשלח</TableHead>
                  <TableHead className="text-xs">נכשל</TableHead>
                  <TableHead className="text-xs">עדכון אחרון</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((row) => (
                  <TableRow
                    key={row.campaign_name}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => openDetails(row.campaign_name)}
                  >
                    <TableCell className="font-medium">{row.campaign_name}</TableCell>
                    <TableCell className="text-xs">{row.channels.map(channelLabel).join(' + ')}</TableCell>
                    <TableCell>{row.recipients.toLocaleString('he-IL')}</TableCell>
                    <TableCell className="text-success">{row.sent.toLocaleString('he-IL')}</TableCell>
                    <TableCell className="text-destructive">{row.failed.toLocaleString('he-IL')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground" dir="ltr">
                      {new Date(row.last_at).toLocaleString('he-IL')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!openCampaign} onOpenChange={(v) => { if (!v) { setOpenCampaign(null); setOpenRows([]); setSelectedRow(null); } }}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>פרטי קמפיין: {openCampaign}</DialogTitle>
            <DialogDescription>לחיצה על שורה תציג את ההודעה המלאה שנשלחה ופרטי הספק.</DialogDescription>
          </DialogHeader>
          {openLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">טוען...</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">שם</TableHead>
                    <TableHead className="text-xs">נמען</TableHead>
                    <TableHead className="text-xs">ערוץ</TableHead>
                    <TableHead className="text-xs">סטטוס</TableHead>
                    <TableHead className="text-xs">זמן</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openRows.map((row, idx) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer text-xs hover:bg-muted/40"
                      onClick={() => setSelectedRow(row)}
                    >
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>{row.recipient_name ?? '-'}</TableCell>
                      <TableCell className="font-mono" dir="ltr">{row.recipient_phone ?? row.recipient_email ?? '-'}</TableCell>
                      <TableCell>{channelLabel(row.channel)}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-muted-foreground" dir="ltr">
                        {new Date(row.sent_at ?? row.created_at).toLocaleTimeString('he-IL')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedRow} onOpenChange={(v) => { if (!v) setSelectedRow(null); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>פרטי שיגור</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <div className="space-y-3 text-sm">
              <DetailRow label="נמען">{selectedRow.recipient_name ?? '-'}</DetailRow>
              <DetailRow label="טלפון / אימייל">
                <span className="font-mono" dir="ltr">{selectedRow.recipient_phone ?? selectedRow.recipient_email ?? '-'}</span>
              </DetailRow>
              <DetailRow label="ערוץ">{channelLabel(selectedRow.channel)}</DetailRow>
              <DetailRow label="סטטוס">{statusBadge(selectedRow.status)}</DetailRow>
              {selectedRow.failure_reason && (
                <DetailRow label="סיבת כשל">
                  <span className="text-destructive">{selectedRow.failure_reason}</span>
                </DetailRow>
              )}
              {selectedRow.provider_message_id && (
                <DetailRow label="מזהה ספק">
                  <span className="font-mono text-xs" dir="ltr">{selectedRow.provider_message_id}</span>
                </DetailRow>
              )}
              <DetailRow label="נוצר">
                <span dir="ltr">{new Date(selectedRow.created_at).toLocaleString('he-IL')}</span>
              </DetailRow>
              {selectedRow.sent_at && (
                <DetailRow label="נשלח">
                  <span dir="ltr">{new Date(selectedRow.sent_at).toLocaleString('he-IL')}</span>
                </DetailRow>
              )}
              <div>
                <p className="mb-1 font-semibold text-foreground">תוכן ההודעה</p>
                <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-foreground">
                  {selectedRow.message_body ?? '-'}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

function DetailedLogTable({ detailedLog, totalRecipients, logStats }: { detailedLog: SimLogEntry[]; totalRecipients: number; logStats: { sent: number; pending: number; failed: number } }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <List className="h-4 w-4 text-primary" />
          לוג מפורט - דגימה מתוך {totalRecipients.toLocaleString()} הודעות
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-3">
            <TabsTrigger value="all" className="gap-1.5">הכל <Badge variant="secondary" className="px-1.5 text-[10px]">{detailedLog.length}</Badge></TabsTrigger>
            <TabsTrigger value="sent" className="gap-1.5">נשלח <Badge variant="secondary" className="bg-success/20 px-1.5 text-[10px] text-success">{logStats.sent}</Badge></TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">ממתין <Badge variant="secondary" className="bg-warning/20 px-1.5 text-[10px] text-warning">{logStats.pending}</Badge></TabsTrigger>
            <TabsTrigger value="failed" className="gap-1.5">נכשל <Badge variant="secondary" className="bg-destructive/20 px-1.5 text-[10px] text-destructive">{logStats.failed}</Badge></TabsTrigger>
          </TabsList>

          {['all', 'sent', 'pending', 'failed'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <div className="max-h-[400px] overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-12 text-xs">#</TableHead>
                      <TableHead className="text-xs">טלפון</TableHead>
                      <TableHead className="text-xs">עיר</TableHead>
                      <TableHead className="text-xs">ערוץ</TableHead>
                      <TableHead className="text-xs">סטטוס</TableHead>
                      <TableHead className="text-xs">זמן</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailedLog.filter((entry) => tab === 'all' || entry.status === tab).map((entry) => (
                      <TableRow key={entry.id} className="text-xs">
                        <TableCell className="text-muted-foreground">{entry.id}</TableCell>
                        <TableCell className="font-mono" dir="ltr">{formatPhoneDisplay(entry.phone)}</TableCell>
                        <TableCell>{entry.city}</TableCell>
                        <TableCell>{entry.channel}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={entry.status === 'sent' ? 'border-success/50 bg-success/10 text-success' : entry.status === 'pending' ? 'border-warning/50 bg-warning/10 text-warning' : 'border-destructive/50 bg-destructive/10 text-destructive'}>
                            {entry.status === 'sent' ? 'נשלח' : entry.status === 'pending' ? 'ממתין' : 'נכשל'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{entry.timestamp}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalRecipients > 200 && <p className="mt-2 py-2 text-center text-xs text-muted-foreground">מוצגות 200 רשומות מדגם מתוך {totalRecipients.toLocaleString()} הודעות</p>}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SummaryBox({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="space-y-1 rounded-md bg-muted/40 p-4 text-center">
      <div className="flex justify-center">{icon}</div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
