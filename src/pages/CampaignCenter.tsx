import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { formatPhoneDisplay } from '@/lib/formatPhone';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrandIcon } from '@/components/BrandIcon';
import {
  ArrowRight, Plus, Bot, Mail, Phone, MessageSquare, Heart, Share2,
  ChevronDown, ChevronUp, Archive, Send, Mic, Image as ImageIcon, Paperclip,
  ChevronDown as ChevronDownIcon, Plug, Camera, Sparkles, Square,
  Trash2, ExternalLink, CheckCircle2, Play,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


import { supabase } from '@/integrations/supabase/client';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SentimentAutomationToggles } from '@/components/automation/SentimentAutomationToggles';
import { CampaignCommentsStream } from '@/components/campaigns/CampaignCommentsStream';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';
import { campaignMatchesExternalPost, normalizePostId } from '@/lib/campaignPostIds';


type TabValue = 'create' | 'published';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'create',    label: 'צור קמפיין' },
  { value: 'published', label: 'פורסמו' },
];

type ChannelCard = {
  id: string;
  label: string;
  price?: string;
  priceUnit?: string;
  free?: boolean;
  brand?: string;
  icon?: typeof Bot;
  iconColor?: string;
};

// Top row (RTL): Facebook → Instagram → X
// Middle row (RTL): IVR → Email → AI Voice
// Bottom row (RTL): YouTube → LinkedIn → TikTok
const CHANNEL_CARDS: ChannelCard[] = [
  { id: 'facebook',  label: 'Facebook',   free: true, brand: 'facebook' },
  { id: 'instagram', label: 'Instagram',  free: true, brand: 'instagram' },
  { id: 'x',         label: 'X',          free: true, brand: 'x' },
  { id: 'ivr',       label: 'IVR',        price: '0.20', priceUnit: 'לדקה',   icon: Phone, iconColor: 'text-[#0f1b3d]' },
  { id: 'email',     label: 'אימייל',     price: '0.01', priceUnit: 'לנמען',  icon: Mail,  iconColor: 'text-rose-500' },
  { id: 'ai-call',   label: 'שיחת AI',    price: '1.00', priceUnit: 'לדקה',   icon: Bot,   iconColor: 'text-[#0f1b3d]' },
  { id: 'youtube',   label: 'YouTube',    free: true, brand: 'youtube' },
  { id: 'linkedin',  label: 'LinkedIn',   free: true, brand: 'linkedin' },
  { id: 'tiktok',    label: 'TikTok',     free: true, brand: 'tiktok' },
];

// Live Twilio number provisioned for this broker's outbound voice/IVR.
const VOICE_DIAL_NUMBER = '+97233829914';

// Connection state is resolved live per-workspace from `social_connections`
// gated by a verified `workspace_social_profile` row. No hardcoded defaults —
// each workspace must own its own Ayrshare profile key before any channel can
// appear connected, preventing cross-tenant leak from shared/global keys.
const EMPTY_CONNECTED = new Set<string>();

// Official brand colors applied only when the channel is connected.
const BRAND_COLOR: Record<string, string> = {
  facebook:          'text-[#1877F2]',
  instagram:         'text-[#E1306C]',
  x:                 'text-foreground',
  youtube:           'text-[#FF0000]',
  linkedin:          'text-[#0A66C2]',
  tiktok:            'text-foreground',
  whatsapp:          'text-[#25D366]',
  telegram:          'text-[#26A5E4]',
  messenger:         'text-[#0084FF]',
  facebook_messenger:'text-[#0084FF]',
  signal:            'text-[#3A76F0]',
};


/* ───────────── Channel grid ───────────── */

const ChannelGrid = ({
  selectedId, onPick, onConnect, brandName, connected = EMPTY_CONNECTED, accountNames = {},
}: {
  selectedId: string | null;
  onPick: (c: ChannelCard) => void;
  onConnect: (c: ChannelCard) => void;
  brandName: string;
  connected?: Set<string>;
  accountNames?: Record<string, string>;
}) => (
  <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
    <div className="grid grid-cols-3 gap-3 sm:gap-4" dir="rtl">
      {CHANNEL_CARDS.map((c) => {
        const Icon = c.icon;
        const isSelected = selectedId === c.id;
        const isConnected = connected.has(c.id);
        const brandColor = isConnected ? (BRAND_COLOR[c.id] ?? c.iconColor ?? 'text-foreground') : 'text-muted-foreground/60';
        return (
          <button key={c.id} type="button"
            onClick={() => isConnected ? onPick(c) : onConnect(c)}

            aria-pressed={isSelected}
            className={cn(
              'group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-background p-3 text-center transition active:scale-[0.98]',
              !isConnected && 'border-dashed border-border bg-muted/30',
              isConnected && !isSelected && 'border-[#C9A84C]/60 hover:border-[#C9A84C] hover:shadow-md',
              isSelected && 'border-primary ring-2 ring-primary/30 shadow-md',
            )}>
            {isConnected && (
              <span aria-hidden className={cn(
                'absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full',
                isSelected ? 'text-primary' : 'text-[#C9A84C]',
              )} title="מחובר">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            )}

            <span className="flex h-7 w-7 items-center justify-center">
              {c.brand
                ? <BrandIcon name={c.brand} className={cn('h-6 w-6', brandColor)} />
                : Icon ? <Icon className={cn('h-6 w-6', brandColor)} /> : null}
            </span>

            <span className={cn(
              'text-[13px] font-semibold leading-tight',
              isConnected ? 'text-foreground' : 'text-muted-foreground/70',
            )}>
              {c.label}
            </span>

            {c.free ? (
              <span className={cn('text-[11px] font-bold', isConnected ? 'text-primary' : 'text-muted-foreground/60')}>
                חינם
              </span>
            ) : (
              <span className={cn('text-[12px] font-bold', isConnected ? 'text-foreground' : 'text-muted-foreground/60')} dir="ltr">
                <bdi dir="ltr">₪{c.price}</bdi>
              </span>
            )}

            {isConnected && accountNames[c.id] && (
              <span
                className="mt-0.5 inline-block max-w-full truncate rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#8a7327]"
                dir="ltr"
                title={formatPhoneDisplay(accountNames[c.id]) || accountNames[c.id]}
              >
                {formatPhoneDisplay(accountNames[c.id]) || accountNames[c.id]}
              </span>
            )}

            {!isConnected && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Plug className="h-3 w-3" />
                חבר
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);



/* ───────────── Inline composer ───────────── */

const TAG_CHIPS = ['[שם_פרטי]', '[עיר]'];
const MAX_CHARS = 1000;

type CampaignListing = {
  id: string;
  property_title: string | null;
  description: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  asking_price: number | null;
  features: unknown;
  source_metadata: Record<string, unknown> | null;
  status: string | null;
  is_published: boolean | null;
  created_at: string | null;
};

const normalizeListingText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const listingSearchText = (listing: CampaignListing) => [
  listing.property_title,
  listing.description,
  listing.city,
  listing.neighborhood,
  listing.address,
  listing.rooms,
  listing.sqm,
  listing.asking_price,
  Array.isArray(listing.features)
    ? listing.features.map((feature) => typeof feature === 'string' ? feature : JSON.stringify(feature)).join(' ')
    : listing.features ? JSON.stringify(listing.features) : '',
  listing.source_metadata ? JSON.stringify(listing.source_metadata) : '',
].map(normalizeListingText).join(' ').toLowerCase();

const listingDedupeKey = (listing: CampaignListing) => {
  const key = [listing.address, listing.city, listing.property_title, listing.rooms, listing.asking_price]
    .map((value) => normalizeListingText(value).toLowerCase())
    .join('|');
  return key.replace(/\|/g, '').length ? key : listing.id;
};

const dedupeListings = (rows: CampaignListing[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = listingDedupeKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const listingOptionLabel = (listing: CampaignListing) => {
  const location = [listing.address || listing.property_title || 'נכס', listing.city].filter(Boolean).join(', ');
  const price = listing.asking_price ? `${Number(listing.asking_price).toLocaleString('he-IL')} ₪` : null;
  return price ? `${location} — ${price}` : location;
};

const InlineComposer = ({
  channel, brandName, onConfirm,
}: {
  channel: ChannelCard;
  brandName: string;
  onConfirm: (payload: { body: string; mode: 'now' | 'scheduled'; media_urls: string[]; scheduled_at: string | null; group_ids: string[] }) => void;
}) => {
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  // Local datetime string in `YYYY-MM-DDTHH:mm` (input[type=datetime-local] format).
  const [scheduledLocal, setScheduledLocal] = useState<string>('');
  // Multi-select of connected Facebook Group IDs to fan-out a single post to.
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [generating, setGenerating] = useState(false);

  // Custom AI generation context (broker steering inputs)
  const [customInstructions, setCustomInstructions] = useState('');
  const [listingQuery, setListingQuery] = useState('');
  const [listings, setListings] = useState<CampaignListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [listingPickerOpen, setListingPickerOpen] = useState(false);

  // Attachment / media state
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ name: string; kind: 'image' | 'file' | 'audio'; url?: string }[]>([]);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Audio recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Generation history
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; topic: string | null; generated_text: string | null; platform: string | null; created_at: string }>>([]);
  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('ai_content_logs')
        .select('id, topic, generated_text, platform, created_at')
        .eq('created_by', user.id)
        .eq('platform', channel.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) setHistory((data as any) || []);
    })();
    return () => { cancelled = true; };
  }, [historyOpen, historyRefresh, channel.id]);

  // Reset on channel change
  useEffect(() => { setBody(''); setMode('now'); setAttachments([]); setCustomInstructions(''); setSelectedListingId(null); setListingQuery(''); }, [channel.id]);

  // Load the full live property list on mount and refresh when the picker opens.
  // Search is client-side so the dropdown always shows every listing by default.
  // The query relies on backend RLS for tenant/workspace isolation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListingsLoading(true);
      try {
        const pageSize = 1000;
        const rows: CampaignListing[] = [];
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from('listings')
            .select('id, property_title, description, city, neighborhood, address, rooms, sqm, floor, asking_price, features, source_metadata, status, is_published, created_at')
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const page = (data as CampaignListing[]) || [];
          rows.push(...page);
          if (page.length < pageSize) break;
        }
        if (!cancelled) setListings(dedupeListings(rows));
      } catch (error) {
        console.error('[CampaignCenter] listings fetch failed', error);
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setListingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listingPickerOpen]);

  const selectedListing = listings.find((l) => l.id === selectedListingId)
    || (selectedListingId ? { id: selectedListingId, property_title: 'נכס נבחר', description: null, city: null, neighborhood: null, address: null, rooms: null, sqm: null, floor: null, asking_price: null, features: null, source_metadata: null, status: null, is_published: null, created_at: null } : null);

  const visibleListings = useMemo(() => {
    const q = normalizeListingText(listingQuery).toLowerCase();
    const deduped = dedupeListings(listings);
    if (!q) return deduped;
    return deduped.filter((listing) => listingSearchText(listing).includes(q));
  }, [listings, listingQuery]);


  const handleFiles = (files: FileList | null, kind: 'image' | 'file') => {
    if (!files) return;
    const max = 25 * 1024 * 1024;
    const added: typeof attachments = [];
    Array.from(files).forEach((f) => {
      if (f.size > max) { toast.error(`${f.name}: גודל מעל 25MB`); return; }
      added.push({ name: f.name, kind, url: URL.createObjectURL(f) });
    });
    if (added.length) setAttachments((a) => [...a, ...added]);
  };

  const handleAIImage = async () => {
    const prompt = body.trim() || customInstructions.trim() || 'תמונת נדל"ן יוקרתית עבור פוסט שיווקי של מתווך בכיר';

    setGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { purpose: 'image', prompt, brand: brandName, language: 'he' },
      });
      if (error) throw error;
      const url = data?.url || data?.image_url;
      if (url) {
        setAttachments((a) => [...a, { name: 'AI Image', kind: 'image', url }]);
        toast.success('תמונה נוצרה');
      } else toast.info('לא התקבלה תמונה מה-AI');
    } catch { toast.error('יצירת תמונה נכשלה'); }
    finally { setGeneratingImage(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAttachments((a) => [...a, { name: `הקלטה ${new Date().toLocaleTimeString('he-IL')}.webm`, kind: 'audio', url }]);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch { toast.error('אין גישה למיקרופון'); }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };


  const insertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) { setBody((b) => (b + ' ' + tag).slice(0, MAX_CHARS)); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = (body.slice(0, start) + tag + body.slice(end)).slice(0, MAX_CHARS);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + tag.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const topic = body.trim()
        || customInstructions.trim()
        || (selectedListing?.property_title ? `פוסט קידום: ${selectedListing.property_title}` : `פוסט שיווקי מאת אודי ויטמן`);
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic,
          platform: channel.id,
          customInstructions: customInstructions.trim() || undefined,
          selectedListingId: selectedListingId || undefined,
          listingFocusOnly: !!selectedListingId,
        },
      });
      if (error) throw error;
      const text = (data?.content || data?.text || '').toString().slice(0, MAX_CHARS);
      if (text) {
        setBody(text);
        // Persist to ai_content_logs so the broker can revisit past generations.
        try {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from('ai_content_logs').insert({
            topic: topic.slice(0, 500),
            generated_text: text,
            platform: channel.id,
            created_by: user?.id ?? null,
          });
          setHistoryRefresh((n) => n + 1);
        } catch (logErr) {
          console.warn('[CampaignCenter] history log failed', logErr);
        }
      } else toast.info('לא התקבל טקסט');
    } catch (e: any) {
      toast.error('יצירת טקסט נכשלה');
    } finally {
      setGenerating(false);
    }
  };


  const hasBody = body.trim().length > 0;
  const count = body.length;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm space-y-4" dir="rtl">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">תוכן ההודעה</h3>
        <div className="flex items-center gap-2">
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <button type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30">
                היסטוריה
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[340px] p-2 max-h-96 overflow-auto" dir="rtl">
              {history.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">אין יצירות שמורות עדיין עבור {channel.label}</p>
              ) : history.map((h) => (
                <button key={h.id} type="button"
                  onClick={() => { setBody((h.generated_text || '').slice(0, MAX_CHARS)); setHistoryOpen(false); toast.success('הטקסט הועתק לעורך'); }}
                  className="mb-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-right hover:bg-muted">
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                  <div className="mt-1 text-xs text-foreground line-clamp-3 whitespace-pre-wrap">
                    {h.generated_text || h.topic || '—'}
                  </div>
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <button type="button" onClick={handleGenerate} disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60">
            <Bot className="h-3.5 w-3.5" />
            {generating ? 'מחולל…' : 'חולל טקסט עם AI'}
          </button>
          <span className="text-[11px] tabular-nums text-muted-foreground" dir="ltr">
            {count}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Broker steering: custom instructions + property promotion picker */}

      <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/[0.03] p-3">
        <Label htmlFor="custom-instructions" className="text-xs font-semibold text-foreground">
          הנחיות ודגשים מיוחדים לפוסט
        </Label>
        <Input
          id="custom-instructions"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder='למשל: "תתמקד באווירה המשפחתית בשכונה", "דגש על משקיעים", "טון קצר ואגרסיבי"'
          className="text-right"
          maxLength={300}
        />

        <div className="pt-1">
          <Label className="text-xs font-semibold text-foreground">קדם נכס ספציפי מהמאגר</Label>
          <Popover open={listingPickerOpen} onOpenChange={setListingPickerOpen}>
            <PopoverTrigger asChild>
              <button type="button"
                className="mt-1 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-right hover:border-primary/40">
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className={cn('truncate', selectedListing ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {selectedListing
                    ? listingOptionLabel(selectedListing as CampaignListing)
                    : 'ללא קידום נכס ספציפי (פוסט כללי של אודי)'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[--radix-popover-trigger-width] p-2 max-h-80 overflow-auto" dir="rtl">
              <Input
                value={listingQuery}
                onChange={(e) => setListingQuery(e.target.value)}
                placeholder="חפש לפי כותרת, עיר או כתובת…"
                className="mb-2 text-right"
              />
              {selectedListingId && (
                <button type="button" onClick={() => { setSelectedListingId(null); setListingPickerOpen(false); }}
                  className="mb-1 w-full rounded-md border border-dashed border-border px-3 py-2 text-right text-xs text-muted-foreground hover:bg-muted">
                  נקה בחירה — פוסט כללי
                </button>
              )}
              <div className="mb-2 px-1 text-[11px] text-muted-foreground">
                {listingsLoading ? 'טוען נכסים מהמאגר…' : `${visibleListings.length} נכסים במאגר`}
              </div>
              {!listingsLoading && visibleListings.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">לא נמצאו נכסים תואמים לחיפוש</p>
              ) : visibleListings.map((l) => (
                <button key={l.id} type="button"
                  onClick={() => { setSelectedListingId(l.id); setListingPickerOpen(false); }}
                  className={cn(
                    'mb-1 w-full rounded-md px-3 py-2 text-right text-sm hover:bg-muted',
                    selectedListingId === l.id && 'bg-primary/10 text-primary',
                  )}>
                  <div className="font-medium truncate">{listingOptionLabel(l)}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[l.property_title, l.neighborhood, l.rooms ? `${l.rooms} חד׳` : null, l.sqm ? `${l.sqm} מ״ר` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Textarea */}
      <Textarea
        ref={textareaRef}
        rows={6}
        value={body}
        maxLength={MAX_CHARS}
        onChange={(e) => setBody(e.target.value)}
        className="resize-y text-right"
      />

      {/* Hidden inputs */}
      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'image'); e.target.value = ''; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'image'); e.target.value = ''; }} />

      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'file'); e.target.value = ''; }} />

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <div key={i} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1 text-xs">
              {att.kind === 'image' && att.url ? (
                <img src={att.url} alt={att.name} className="h-8 w-8 rounded object-cover" />
              ) : att.kind === 'audio' ? (
                <Mic className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[140px] truncate">{att.name}</span>
              <button type="button" onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Tag pills + action icons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button type="button" onClick={recording ? stopRecording : startRecording}
            className={cn(
              'rounded-lg border p-2 transition',
              recording
                ? 'border-destructive bg-destructive/10 text-destructive animate-pulse'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
            aria-label={recording ? 'עצור הקלטה' : 'הקלטה'}>
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground" aria-label="גלריה">
                <ImageIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1" dir="rtl">
              <button type="button" onClick={() => galleryInputRef.current?.click()}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
                <span>גלריה</span>
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
                <span>מצלמה</span>
                <Camera className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={handleAIImage} disabled={generatingImage}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60">
                <span>{generatingImage ? 'מחולל…' : 'תמונת AI'}</span>
                <Sparkles className="h-4 w-4 text-primary" />
              </button>
            </PopoverContent>
          </Popover>

          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground" aria-label="קובץ מצורף">
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {TAG_CHIPS.map((tag) => (
            <button key={tag} type="button" onClick={() => insertTag(tag)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary/40 hover:text-primary">
              {tag}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">תגיות:</span>
        </div>
      </div>


      {/* Facebook Group multi-select — only when posting to Facebook */}
      {hasBody && channel.id === 'facebook' && (
        <CampaignGroupSelector selectedIds={groupIds} onChange={setGroupIds} />
      )}

      {/* Dispatch mode selector — only when body has content */}
      {hasBody && (
        <div className="rounded-xl border border-border bg-background p-2 grid grid-cols-2 gap-2">
          {([
            { id: 'now',       label: 'שליחה מיידית' },
            { id: 'scheduled', label: 'תזמון עתידי' },
          ] as const).map((opt) => {
            const active = mode === opt.id;
            return (
              <button key={opt.id} type="button" onClick={() => setMode(opt.id)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-sm font-semibold transition',
                  active
                    ? 'border border-foreground/80 bg-background text-foreground shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground',
                )}>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Scheduled date+time picker */}
      {hasBody && mode === 'scheduled' && (() => {
        // datetime-local expects LOCAL wall-clock time. toISOString() returns
        // UTC, which in IL evenings yields a "min" in tomorrow's local clock
        // and silently blocks valid picks. Build the floor in local time.
        const floor = new Date(Date.now() + 60_000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const minLocal = `${floor.getFullYear()}-${pad(floor.getMonth() + 1)}-${pad(floor.getDate())}T${pad(floor.getHours())}:${pad(floor.getMinutes())}`;
        return (
          <div className="rounded-xl border border-border bg-background p-3 space-y-2">
            <label className="block text-xs font-semibold text-foreground">תאריך ושעת פרסום</label>
            <input
              type="datetime-local"
              value={scheduledLocal}
              min={minLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              dir="ltr"
            />
            {scheduledLocal && new Date(scheduledLocal).getTime() <= Date.now() && (
              <p className="text-xs text-destructive">יש לבחור מועד עתידי</p>
            )}
          </div>
        );
      })()}

      {(() => {
        const scheduledDate = scheduledLocal ? new Date(scheduledLocal) : null;
        const scheduledValid = mode === 'now' || (!!scheduledDate && scheduledDate.getTime() > Date.now());
        const canSend = hasBody && scheduledValid;
        return (
          /* Dispatch CTA */
          <button type="button"
            onClick={() => canSend && onConfirm({
              body,
              mode,
              media_urls: attachments
                .filter((a) => a.kind === 'image' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url))
                .map((a) => a.url as string),
              scheduled_at: mode === 'scheduled' && scheduledDate ? scheduledDate.toISOString() : null,
              group_ids: channel.id === 'facebook' ? groupIds : [],
            })}
            disabled={!canSend}
            className={cn(
              'w-full rounded-xl px-4 py-3 text-sm font-bold transition flex items-center justify-center gap-2',
              canSend
                ? 'bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)] shadow-md'
                : 'bg-muted text-muted-foreground/80 cursor-not-allowed',
            )}>
            <Send className="h-4 w-4 -scale-x-100" />
            {mode === 'scheduled' ? 'תזמן פרסום' : 'שגר פוסט ציבורי עכשיו'}
          </button>
        );
      })()}
    </div>
  );
};

/* ───────────── Dispatch confirmation modal ───────────── */

const ConfirmDispatchDialog = ({
  open, onClose, channel, body, brandName, mediaUrls, scheduledAt, groupIds, onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelCard | null;
  body: string;
  brandName: string;
  mediaUrls: string[];
  scheduledAt: string | null;
  groupIds: string[];
  onConfirmed: () => void;
}) => {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [pages, setPages] = useState<Array<{ id: string; name: string; username: string | null; avatar: string | null }>>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);

  useEffect(() => {
    if (!open || !channel || !user) return;
    (async () => {
      setPagesLoading(true);
      try {
        const { data } = await supabase
          .from('ayrshare_social_accounts')
          .select('id, platform, display_name, account_username, username, avatar_url, is_active, connected')
          .eq('user_id', user.id)
          .eq('platform', channel.id)
          .order('updated_at', { ascending: false });
        const rows = (data || [])
          .filter((r: any) => r.is_active !== false && r.connected !== false)
          .map((r: any) => ({
            id: r.id,
            name: r.display_name || r.account_username || r.username || channel.label,
            username: r.account_username || r.username || null,
            avatar: r.avatar_url || null,
          }));
        setPages(rows);
        setSelectedPageId(rows[0]?.id ?? null);
      } finally {
        setPagesLoading(false);
      }
    })();
  }, [open, channel, user]);

  if (!channel) return null;

  const selectedPage = pages.find((p) => p.id === selectedPageId) || null;
  const profileLabel = selectedPage
    ? `${selectedPage.name}${selectedPage.username ? ` · @${selectedPage.username}` : ''}`
    : `${brandName} · @${brandName.replace(/\s+/g, '')}`;
  const initials = (selectedPage?.name || brandName).split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'R';
  const summaryTitle = body.trim().slice(0, 24) || channel.label;

  const SOCIAL_CHANNELS = new Set(['facebook', 'instagram', 'x', 'twitter', 'linkedin', 'youtube', 'tiktok']);

  const handleConfirm = async () => {
    if (!user) { toast.error('יש להתחבר'); return; }
    setSending(true);
    try {
      const campaignName = `${brandName} · ${channel.label}`;

      if (SOCIAL_CHANNELS.has(channel.id)) {
        // mediaUrls was already filtered to public https links upstream by
        // InlineComposer; if it ends up empty here while the composer had any
        // image attachments, the edge function's guard will reject the post.
        if (!mediaUrls) {
          // defensive: should never happen since prop is typed string[]
        }
        // Publish via Ayrshare to the workspace-connected social page.
        const { data, error } = await supabase.functions.invoke('ayrshare-post', {
          body: {
            post: body,
            channels: [channel.id],
            campaign_name: campaignName,
            media_urls: mediaUrls,
            scheduled_at: scheduledAt,
            group_ids: groupIds,
          },
        });
        // When the edge function returns a non-2xx, supabase-js sets a generic
        // "non-2xx status code" message and stuffs the real body into
        // error.context.response — read it so the user sees our Hebrew message
        // (e.g. duplicate-content guidance) instead of the raw status text.
        if (error) {
          let friendly: string | null = null;
          try {
            const resp = (error as any)?.context?.response;
            if (resp && typeof resp.json === 'function') {
              const body = await resp.json();
              friendly = body?.error || body?.message || null;
            }
          } catch { /* ignore */ }
          throw new Error(friendly || error.message || 'שגיאת רשת');
        }
        if ((data as any)?.error) throw new Error((data as any).error);
        const groupFailures: any[] = Array.isArray((data as any)?.group_failures) ? (data as any).group_failures : [];
        if (scheduledAt) {
          const when = new Date(scheduledAt).toLocaleString('he-IL');
          toast.success(`הפוסט תוזמן ל-${when} בערוץ ${channel.label}`);
        } else if (groupIds.length > 0 && groupFailures.length === 0) {
          toast.success('הפוסט שותף בהצלחה בכל הקבוצות שנבחרו!');
        } else if (groupIds.length > 0 && groupFailures.length > 0) {
          toast.error(`פורסם אך נכשל ב-${groupFailures.length} קבוצות`);
        } else {
          toast.success(`הקמפיין פורסם בהצלחה ב-${channel.label}!`);
        }
      } else {
        // Direct-messaging channels (SMS / email / IVR / AI Voice) broadcast to leads.
        const { data: leads, error } = await supabase
          .from('leads')
          .select('id, full_name, phone_number, email')
          .limit(100);
        if (error) throw error;

        const rows = (leads || []).map((l: any) => ({
          user_id: user.id,
          campaign_name: campaignName,
          channel: channel.id,
          lead_id: l.id,
          recipient_phone: l.phone_number,
          recipient_email: l.email,
          recipient_name: l.full_name,
          message_body: body,
          status: 'queued' as const,
        }));
        if (rows.length > 0) {
          const { error: insErr } = await supabase.from('campaign_logs').insert(rows);
          if (insErr) throw insErr;
        }

        // Fan-out live sends for direct channels.
        let dispatched = 0; let failed = 0;
        if (channel.id === 'ivr' || channel.id === 'ai-call') {
          for (const l of leads || []) {
            if (!l.phone_number) continue;
            const { error: callErr } = await supabase.functions.invoke('vapi-outbound-call', {
              body: { phone_number: l.phone_number, lead_id: l.id },
            });
            if (callErr) failed++; else dispatched++;
          }
        } else if (channel.id === 'email') {
          for (const l of leads || []) {
            if (!l.email) continue;
            const { error: mailErr } = await supabase.functions.invoke('resend-email-sender', {
              body: {
                recipient_email: l.email,
                recipient_name: l.full_name,
                subject: `${brandName} · עדכון אישי עבורך`,
                intro: body || 'מצורפים הפרטים העדכניים שביקשת.',
                cta_question: 'מתי נוח לך לקפוץ לראות?',
              },
            });
            if (mailErr) failed++; else dispatched++;
          }
        }

        if (channel.id === 'ivr' || channel.id === 'ai-call' || channel.id === 'email') {
          const total = rows.length;
          toast.success(
            <span dir="rtl" className="inline-flex items-center gap-2">
              <span>נשלחו <span className="font-bold tabular-nums">{dispatched}</span> מתוך <span className="font-bold tabular-nums">{total}</span> בערוץ {channel.label}</span>
              {failed > 0 && (
                <span className="inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-[11px] font-bold text-destructive-foreground">
                  {failed} כשלונות
                </span>
              )}
            </span>
          );
        } else {
          toast.success(`שודר ל-${rows.length} מתעניינים בערוץ ${channel.label}`);
        }
      }
      onConfirmed();
      onClose();
    } catch (e: any) {
      toast.error('פרסום נכשל: ' + (e?.message ?? 'שגיאה לא ידועה'));
    } finally {
      setSending(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">אישור דיוור וסיכום תקציב</DialogTitle>
          <DialogDescription className="text-center">
            קמפיין "{summaryTitle}" · ערוצים: {channel.label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-right text-sm font-semibold text-foreground">פרסום בעמוד / פרופיל</div>
          <div className="rounded-xl border border-border bg-background p-3 space-y-3">
            {pagesLoading ? (
              <div className="text-right text-xs text-muted-foreground py-2">טוען עמודים מחוברים…</div>
            ) : pages.length === 0 ? (
              <div className="text-right text-xs text-muted-foreground py-2">
                לא נמצא עמוד {channel.label} מחובר. חבר את החשבון בהגדרות.
              </div>
            ) : (
              <Select value={selectedPageId ?? undefined} onValueChange={setSelectedPageId}>
                <SelectTrigger className="w-full text-right" dir="rtl">
                  <SelectValue placeholder="בחר עמוד" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.username ? ` · @${p.username}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center justify-end gap-3 px-1">
              <div className="text-right">
                <div className="text-sm font-bold text-foreground">{selectedPage?.name || brandName}</div>
                {(selectedPage?.username || brandName) && (
                  <div className="text-xs text-muted-foreground" dir="ltr">@{selectedPage?.username || brandName.replace(/\s+/g, '')}</div>
                )}
              </div>
              <Avatar className="h-9 w-9">
                {selectedPage?.avatar ? <AvatarImage src={selectedPage.avatar} alt={selectedPage.name} /> : null}
                <AvatarFallback className="bg-muted text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>


        <DialogFooter className="!justify-between gap-2 sm:gap-2 flex-row-reverse">
          <Button onClick={handleConfirm} disabled={sending}
            className="bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)]">
            {sending ? 'מפרסם ברשתות החברתיות...' : 'אישור ושידור'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={sending}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


/* ───────────── Tab 2: Published feed ───────────── */

type CampaignRow = {
  id: string;
  campaign_name: string;
  channel: string;
  message_body: string | null;
  created_at: string;
  provider_message_id: string | null;
  provider_response?: any;
  recipient_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
  metrics_updated_at?: string | null;
};

const extractFunctionError = async (error: any, fallback = 'שגיאת API חיצונית') => {
  const status = error?.context?.status ?? error?.status;
  let details: any = null;
  try {
    details = error?.context?.clone ? await error.context.clone().json() : null;
  } catch { /* ignore */ }
  const msg = details?.error || details?.api_errors?.[0]?.payload?.message || details?.mapping_errors?.[0]?.error || error?.message || fallback;
  return `${status ? `HTTP ${status}: ` : ''}${msg}`;
};

const firstPipelineError = (data: any): string | null => {
  const api = Array.isArray(data?.api_errors) ? data.api_errors[0] : null;
  const mapping = Array.isArray(data?.mapping_errors) ? data.mapping_errors[0] : null;
  if (api) return `Ayrshare ${api.status ?? ''}: ${api.payload?.message ?? api.error ?? 'API rejected request'}`;
  if (mapping) return mapping.error ?? 'Invalid external post id mapping';
  return null;
};

// Derive the live native post URL from Ayrshare provider response, or build
// a best-effort fallback URL from the platform + native post id.
const derivePostUrl = (r: CampaignRow): string | null => {
  const ids = (r.provider_response as any)?.postIds;
  if (Array.isArray(ids)) {
    const ch = String(r.channel || '').toLowerCase();
    const match = ids.find((p: any) => String(p?.platform || '').toLowerCase() === (ch === 'x' ? 'twitter' : ch));
    const url = match?.postUrl || match?.url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
  }
  const pid = r.provider_message_id;
  if (!pid) return null;
  const ch = String(r.channel || '').toLowerCase();
  if (ch === 'facebook') return `https://www.facebook.com/${pid}`;
  if (ch === 'instagram') return `https://www.instagram.com/p/${pid}/`;
  if (ch === 'x' || ch === 'twitter') return `https://twitter.com/i/web/status/${pid}`;
  if (ch === 'linkedin') return `https://www.linkedin.com/feed/update/${pid}`;
  if (ch === 'youtube') return `https://www.youtube.com/watch?v=${pid}`;
  if (ch === 'tiktok') return `https://www.tiktok.com/@/video/${pid}`;
  return null;
};

const FEED_PLATFORMS: { id: string; label: string; brand?: string; icon?: typeof Bot }[] = [
  { id: 'facebook',  label: 'Facebook',  brand: 'facebook' },
  { id: 'instagram', label: 'Instagram', brand: 'instagram' },
  { id: 'x',         label: 'X',         brand: 'x' },
  { id: 'tiktok',    label: 'TikTok',    brand: 'tiktok' },
  { id: 'linkedin',  label: 'LinkedIn',  brand: 'linkedin' },
  { id: 'youtube',   label: 'YouTube',   brand: 'youtube' },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: MessageSquare },
];

const GlobalSocialFeed = ({
  rows, activeChannel, onChannelChange, archivedCount, onOpenArchive,
}: {
  rows: CampaignRow[];
  activeChannel: string;
  onChannelChange: (id: string) => void;
  archivedCount: number;
  onOpenArchive: () => void;
}) => {
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    FEED_PLATFORMS.forEach((p) => { m[p.id] = 0; });
    rows.forEach((r) => {
      const k = String(r.channel || '').toLowerCase();
      if (k in m) m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [rows]);

  const Pill = ({ id, label, brand, icon: Icon }: { id: string; label: string; brand?: string; icon?: typeof Bot }) => {
    const active = activeChannel === id;
    const count = counts[id] ?? 0;
    return (
      <button
        type="button"
        onClick={() => onChannelChange(id)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
          active
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-border bg-background text-foreground hover:border-primary/40',
        )}
      >
        {brand ? (
          <BrandIcon name={brand} className={cn('h-3.5 w-3.5', active ? 'text-primary-foreground' : (BRAND_COLOR[brand] ?? 'text-muted-foreground'))} />
        ) : Icon ? (
          <Icon className="h-3.5 w-3.5" />
        ) : null}
        <span>{label}</span>
        <span className={cn(
          'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}>{count}</span>
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1" dir="rtl">
      <button
        type="button"
        onClick={() => onChannelChange('all')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
          activeChannel === 'all'
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-border bg-background text-foreground hover:border-primary/40',
        )}
      >
        הכל
        <span className={cn(
          'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
          activeChannel === 'all' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}>{counts.all}</span>
      </button>
      {FEED_PLATFORMS.map((p) => <Pill key={p.id} {...p} />)}
      <button
        type="button"
        onClick={onOpenArchive}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground whitespace-nowrap"
        title="ארכיון תגובות"
      >
        <Archive className="h-3.5 w-3.5" />
        ארכיון
        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{archivedCount}</span>
      </button>
    </div>
  );
};

const PublishedFeed = () => {
  const { settings } = useWhiteLabel();
  const ownerName = settings?.agency_name || 'אודי ויטמן';
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [archivedCount, setArchivedCount] = useState<number>(0);
  const [fbPageName, setFbPageName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('workspace_social_profile')
        .select('facebook_page_name')
        .maybeSingle();
      setFbPageName((data as any)?.facebook_page_name ?? null);
    })();
  }, []);



  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); return; }
    setUserId(user.id);
    const { data } = await supabase
      .from('campaign_logs')
      .select('id, campaign_name, channel, message_body, created_at, provider_message_id, provider_response, is_archived, like_count, comment_count, share_count, view_count, metrics_updated_at')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(500);
    const grouped = new Map<string, CampaignRow>();
    (data || []).forEach((r: any) => {
      const key = `${r.campaign_name}|${r.channel}|${r.created_at.slice(0, 16)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.recipient_count = (existing.recipient_count || 1) + 1;
        if (!existing.provider_message_id && r.provider_message_id) {
          existing.provider_message_id = r.provider_message_id;
        }
        existing.like_count = Math.max(existing.like_count || 0, r.like_count || 0);
        existing.comment_count = Math.max(existing.comment_count || 0, r.comment_count || 0);
        existing.share_count = Math.max(existing.share_count || 0, r.share_count || 0);
        existing.view_count = Math.max(existing.view_count || 0, r.view_count || 0);
      } else {
        grouped.set(key, { ...r, recipient_count: 1 });
      }
    });
    setRows(Array.from(grouped.values()));

    const { count } = await supabase
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_archived', true);
    setArchivedCount(count ?? 0);
  };

  // Ask the backend to (a) refresh live Ayrshare analytics — likes/comments/shares/views
  // land back on campaign_logs and stream in via the realtime subscription below — and
  // (b) pull fresh inbound comments into engagement_events so the per-card comments tree
  // updates without a manual refresh.
  const refreshMetrics = async () => {
    // Force a direct live page fetch every time — bypass any cached counters
    // so the UI mirrors the exact real-time Meta payload via Ayrshare.
    const cacheBust = `${Date.now()}-${crypto.randomUUID()}`;
    // Run the comments sync (nested replies + Like reactions) and the
    // headline analytics in parallel — neither blocks the other.
    const syncPromise = supabase.functions.invoke('ayrshare-sync-comments', {
      body: { force_live: true, cache_bust: cacheBust },
    }).catch((err) => { console.warn('[refreshMetrics] sync-comments failed (non-fatal)', err); return null; });

    try {
      const [{ data, error }] = await Promise.all([
        supabase.functions.invoke('ayrshare-analytics', {
          body: { force_live: true, cache_bust: cacheBust },
        }),
        syncPromise,
      ]);
      if (error) {
        const msg = await extractFunctionError(error, 'רענון מדדי פייסבוק נכשל');
        console.error('[refreshMetrics] analytics invoke error', { error, message: msg });
        toast.error(msg);
        return;
      }
      const surfacedError = firstPipelineError(data);
      if (surfacedError) {
        console.error('[refreshMetrics] analytics pipeline error', data);
        toast.error(surfacedError);
      }
      const results: Array<{ id: string; ok: boolean; counts?: { likes: number; comments: number; shares: number; views: number }; metrics_updated_at?: string; native_post_id?: string | null }> = Array.isArray((data as any)?.results) ? (data as any).results : [];
      const byId = new Map(results.filter((r) => r.ok && r.counts).map((r) => [r.id, r]));

      // Authoritative nested-comment count: every comment ingested by
      // ayrshare-comments-fetch (parent + every recursive child) lives in
      // engagement_events keyed by external_post_id. Use that count as the
      // floor so the headline never under-reports vs the live FB thread.
      const nativeIds = Array.from(
        new Set(
          results
            .map((r) => (r?.native_post_id ? String(r.native_post_id) : null))
            .filter((v): v is string => !!v),
        ),
      );
      const commentCountByPostId = new Map<string, number>();
      if (nativeIds.length) {
        try {
          const { data: ev } = await supabase
            .from('engagement_events')
            .select('external_post_id')
            .in('external_post_id', nativeIds);
          for (const row of ev ?? []) {
            const pid = String((row as any).external_post_id || '');
            if (!pid) continue;
            commentCountByPostId.set(pid, (commentCountByPostId.get(pid) ?? 0) + 1);
          }
        } catch (err) {
          console.warn('[refreshMetrics] engagement_events count failed', err);
        }
      }

      if (byId.size === 0 && commentCountByPostId.size === 0) return;
      setRows((prev) => prev?.map((r) => {
        const hit = byId.get(r.id);
        const nativeId = hit?.native_post_id ? String(hit.native_post_id) : (r.provider_message_id ?? null);
        const nestedComments = nativeId ? (commentCountByPostId.get(nativeId) ?? 0) : 0;
        if (!hit || !hit.counts) {
          // Even without a fresh analytics row, repaint nested comment count.
          if (nestedComments > (r.comment_count ?? 0)) {
            return { ...r, comment_count: nestedComments, metrics_updated_at: new Date().toISOString() };
          }
          return r;
        }
        return {
          ...r,
          like_count: hit.counts.likes,
          comment_count: Math.max(hit.counts.comments, nestedComments),
          share_count: hit.counts.shares,
          view_count: hit.counts.views,
          metrics_updated_at: hit.metrics_updated_at ?? new Date().toISOString(),
        };
      }) ?? prev);
    } catch (err) {
      console.warn('[refreshMetrics] analytics crashed (non-fatal)', err);
    }
  };


  useEffect(() => {
    load();
    refreshMetrics();
    const reloadInterval = setInterval(load, 30000);
    const metricsInterval = setInterval(refreshMetrics, 45000);
    return () => {
      clearInterval(reloadInterval);
      clearInterval(metricsInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: live-patch counters into rows as soon as the edge function
  // updates campaign_logs — no manual refresh needed.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`campaign_logs:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaign_logs', filter: `user_id=eq.${userId}` },
        (payload) => {
          const updated: any = payload.new;
          setRows((prev) => prev?.map((r) => {
            if (r.id !== updated.id && !campaignMatchesExternalPost(r, updated.provider_message_id)) return r;
            return {
              ...r,
              provider_message_id: r.provider_message_id || updated.provider_message_id,
              like_count: updated.like_count ?? r.like_count,
              comment_count: updated.comment_count ?? r.comment_count,
              share_count: updated.share_count ?? r.share_count,
              view_count: updated.view_count ?? r.view_count,
              metrics_updated_at: updated.metrics_updated_at ?? r.metrics_updated_at,
            };
          }) ?? prev);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_logs', filter: `user_id=eq.${userId}` },
        () => { load(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engagement_events', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const changed: any = payload.new || payload.old;
          const externalPostId = normalizePostId(changed?.external_post_id);
          if (!externalPostId) return;

          // Ignore archived rows so the counter doesn't drift on archive sweeps.
          const isArchived = !!(payload.new as any)?.is_archived;

          setRows((prev) => prev?.map((r) => {
            if (!campaignMatchesExternalPost(r, externalPostId)) return r;
            const current = typeof r.comment_count === 'number' ? r.comment_count : 0;
            const nextCount = payload.eventType === 'INSERT' && !isArchived
              ? current + 1
              : payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && isArchived)
                ? Math.max(0, current - 1)
                : current;
            return {
              ...r,
              comment_count: nextCount,
              metrics_updated_at: r.metrics_updated_at ?? new Date().toISOString(),
            };
          }) ?? prev);

          // Reconcile against an authoritative count, scoped to this owner.
          const { count } = await supabase
            .from('engagement_events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_archived', false)
            .eq('external_post_id', externalPostId);
          if (typeof count === 'number') {
            setRows((prev) => prev?.map((r) => (
              campaignMatchesExternalPost(r, externalPostId)
                ? { ...r, comment_count: count, metrics_updated_at: r.metrics_updated_at ?? new Date().toISOString() }
                : r
            )) ?? prev);
          }
        },
      )

      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Each card represents a GROUP of campaign_logs rows (same campaign_name +
  // channel + minute bucket). Archive / delete must act on every row in the
  // group, otherwise sibling rows reappear on the next refresh.
  const groupFilter = (r: CampaignRow) => {
    const minute = new Date(r.created_at);
    const from = new Date(minute);
    from.setSeconds(0, 0);
    const to = new Date(from.getTime() + 60_000);
    return { from: from.toISOString(), to: to.toISOString() };
  };

  const archiveCampaign = async (r: CampaignRow) => {
    const { from, to } = groupFilter(r);
    const { error } = await supabase
      .from('campaign_logs')
      .update({ is_archived: true })
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .gte('created_at', from)
      .lt('created_at', to);
    if (error) { toast.error('העברה לארכיון נכשלה: ' + error.message); return; }
    setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? prev);
    toast.success('הקמפיין הועבר לארכיון');
    load();
  };

  const deleteCampaign = async (r: CampaignRow) => {
    if (!confirm('למחוק את הפוסט הזה לצמיתות (כולל מחיקה מפייסבוק)?')) return;

    // 1. Wipe the post off the native social network via Ayrshare first.
    //    If that fails, abort so we don't end up with a local-only delete
    //    that leaves a phantom post live on the broker's Facebook Page.
    const externalIds = Array.from(new Set([
      r.provider_message_id,
      ...((r as any).provider_response?.postIds || []).map((p: any) => p?.id ?? p?.postId).filter(Boolean),
    ].filter(Boolean) as string[]));
    if (externalIds.length > 0) {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ayrshare-post`;
      for (const pid of externalIds) {
        try {
          const resp = await fetch(fnUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${accessToken ?? ''}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ external_post_id: pid }),
          });
          if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            toast.error(`מחיקה מפייסבוק נכשלה: ${body?.error ?? resp.status}`);
            return;
          }
        } catch (e: any) {
          toast.error(`מחיקה מפייסבוק נכשלה: ${e?.message ?? e}`);
          return;
        }
      }
    }

    // 2. Local cleanup of the campaign_logs group rows.
    const { from, to } = groupFilter(r);
    const { error, count } = await supabase
      .from('campaign_logs')
      .delete({ count: 'exact' })
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .gte('created_at', from)
      .lt('created_at', to);
    if (error) { toast.error('מחיקה נכשלה: ' + error.message); return; }
    setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? prev);
    toast.success(
      externalIds.length > 0
        ? `הפוסט נמחק בהצלחה מפייסבוק ומהמערכת${typeof count === 'number' ? ` (${count} רשומות)` : ''}`
        : `הפוסט נמחק מהמערכת${typeof count === 'number' ? ` (${count} רשומות)` : ''}`,
    );
    load();
  };



  const filteredRows = useMemo(() => {
    if (!rows) return rows;
    if (activeChannel === 'all') return rows;
    return rows.filter((r) => String(r.channel || '').toLowerCase() === activeChannel);
  }, [rows, activeChannel]);

  if (rows === null) {
    return <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">טוען…</div>;
  }

  return (
    <div className="space-y-3">
      <GlobalSocialFeed
        rows={rows}
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        archivedCount={archivedCount}
        onOpenArchive={() => toast.info('ארכיון התגובות יוצג בקרוב')}
      />

      {filteredRows && filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">אין קמפיינים בערוץ זה</p>
          <p className="mt-1 text-xs text-muted-foreground">לאחר שתפעיל קמפיין מהטאב "צור קמפיין", הוא יופיע כאן עם מעקב לייקים, שיתופים ותגובות.</p>
        </div>
      ) : (filteredRows || []).map((r) => {
        const isOpen = expanded[r.id] ?? false;
        const dt = new Date(r.created_at);
        const dateStr = dt.toLocaleDateString('he-IL') + ', ' + dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        const platformMeta = FEED_PLATFORMS.find((p) => p.id === String(r.channel || '').toLowerCase());
        const postUrl = derivePostUrl(r);
        const bodyText = r.message_body || '';
        const isHe = /[\u0590-\u05FF]/.test(bodyText);
        const dirAttr: 'rtl' | 'ltr' = isHe ? 'rtl' : 'ltr';
        const alignClass = isHe ? 'text-right' : 'text-left';
        const preview = bodyText.trim().slice(0, 100) + (bodyText.trim().length > 100 ? '…' : '');
        const hasMetrics = !!r.metrics_updated_at;
        const fmt = (v: number | null | undefined) => (hasMetrics && typeof v === 'number' ? v : '–');
        const pageLabel = (String(r.channel || '').toLowerCase() === 'facebook' && fbPageName) ? fbPageName : ownerName;
        return (
          <article
            key={r.id}
            className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden cursor-pointer"
            dir={dirAttr}
            onClick={() => setExpanded((s) => ({ ...s, [r.id]: !isOpen }))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded((s) => ({ ...s, [r.id]: !isOpen }));
              }
            }}
          >
            <header className="p-4 space-y-2">

              {/* Row 1: post title */}
              <h3 className={cn('font-semibold text-foreground truncate', alignClass)} dir={dirAttr}>
                {(bodyText.trim().split('\n')[0] || r.campaign_name)}
              </h3>

              {/* Row 2: date · page name · platform logo (logo & date swapped) */}
              <div className={cn('flex items-center gap-2', isHe ? 'flex-row-reverse justify-end' : 'flex-row justify-end')}>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{dateStr}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-sm font-semibold text-foreground truncate">{pageLabel}</span>
                <span className="inline-flex items-center justify-center shrink-0">
                  {platformMeta?.brand ? (
                    <BrandIcon name={platformMeta.brand} className={cn('h-5 w-5', BRAND_COLOR[platformMeta.brand] ?? 'text-muted-foreground')} />
                  ) : platformMeta?.icon ? (
                    <platformMeta.icon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <span className="text-[10px] font-bold uppercase">{r.channel?.slice(0, 2)}</span>
                  )}
                </span>
              </div>

              {/* Row 3: counters + expand/collapse chevron (chevron moved to opposite side) */}
              <div className={cn('flex items-center justify-between gap-3', isHe ? 'flex-row' : 'flex-row-reverse')}>
                <div className={cn('flex items-center gap-3 text-xs text-muted-foreground flex-wrap', isHe ? 'flex-row-reverse' : 'flex-row')}>
                  <span className="inline-flex items-center gap-1" title="לייקים">
                    <Heart className="h-3.5 w-3.5 text-[hsl(220_70%_25%)]" />
                    <span className="tabular-nums">{fmt(r.like_count)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1" title="תגובות">
                    <MessageSquare className="h-3.5 w-3.5 text-[hsl(220_70%_25%)]" />
                    <span className="tabular-nums">{fmt(r.comment_count)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1" title="שיתופים">
                    <Share2 className="h-3.5 w-3.5 text-[hsl(220_70%_25%)]" />
                    <span className="tabular-nums">{fmt(r.share_count)}</span>
                  </span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setExpanded((s) => ({ ...s, [r.id]: !isOpen })); }}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted shrink-0"
                        aria-label={isOpen ? 'כווץ' : 'הרחב'}>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </header>


            {isOpen && (
              <>
                <div className={cn('mx-4 mb-3 rounded-xl border border-border bg-background p-4 text-sm text-foreground whitespace-pre-wrap', alignClass)} dir={dirAttr}>
                  {bodyText || <span className="text-muted-foreground">אין תוכן הודעה</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                  <Stat icon={MessageSquare} label="תגובות" value={r.comment_count} hasData={hasMetrics} />
                  <Stat icon={Share2}         label="שיתופים" value={r.share_count}   hasData={hasMetrics} />
                  <Stat icon={Heart}          label="לייקים"  value={r.like_count}    hasData={hasMetrics} />
                </div>
                <div className="flex items-center justify-between gap-2 px-4 pb-4" dir="rtl" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); deleteCampaign(r); }}
                          className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="ml-1 h-4 w-4" />
                    מחק פוסט
                  </Button>
                  <Button variant="outline" size="sm"
                          disabled={!postUrl}
                          onClick={(e) => { e.stopPropagation(); postUrl && window.open(postUrl, '_blank', 'noopener,noreferrer'); }}>
                    <ExternalLink className="ml-1 h-4 w-4" />
                    פתח פוסט
                  </Button>
                </div>
                <div className="border-t border-border bg-muted/30 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {userId ? (
                    <CampaignCommentsStream userId={userId} campaign={r} />
                  ) : (
                    <p className="text-xs text-muted-foreground text-right">נדרשת התחברות לצפייה בתגובות</p>
                  )}
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
};


const Stat = ({ icon: Icon, label, value, hasData = true }: { icon: any; label: string; value: number | null | undefined; hasData?: boolean }) => {
  // When Ayrshare hasn't returned analytics yet (e.g. historical posts the
  // current Ayrshare plan can't pull, or freshly published posts before the
  // first refresh) we render a clean "–" instead of misleading zeros.
  const display = hasData && typeof value === 'number' ? value : '–';
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2 flex items-center justify-between">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="text-right">
        <div className="text-sm font-bold text-foreground">{display}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
};

/* Responses tab removed — comments stream lives inside each Published card. */

/* ───────────── Voice Lead Picker ("למי מחייגים?") ───────────── */

type VoiceLead = { id: string; full_name: string | null; phone: string | null };

const VOICE_AGENTS: { id: string; label: string; voice_id: string }[] = [
  { id: 'sarah',    label: 'שרה (אישה)',     voice_id: 'EXAVITQu4vr4xnSDxMaL' },
  { id: 'matilda',  label: 'מטילדה (אישה)', voice_id: 'XrExE9yKIg1WjnnlVkGX' },
  { id: 'charlie',  label: 'צ׳רלי (גבר)',    voice_id: 'IKne3meq5aSn9XLyUdCD' },
];

const VoiceLeadPickerDialog = ({
  open, onClose, channel,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelCard | null;
}) => {
  const [leads, setLeads] = useState<VoiceLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [listGroup, setListGroup] = useState<string>('all');
  const [agentId, setAgentId] = useState<string>('sarah');
  const [instructions, setInstructions] = useState('');
  const [dialing, setDialing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setListGroup('all'); setAgentId('sarah'); setInstructions('');
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('leads')
        .select('id, full_name, phone')
        .not('phone', 'is', null)
        .order('full_name', { ascending: true })
        .limit(500);
      setLeads(((data as any[]) ?? []) as VoiceLead[]);
      setLoading(false);
    })();
  }, [open]);

  const dial = async () => {
    const targets = leads;
    if (targets.length === 0) { toast.error('אין מתעניינים זמינים לחיוג'); return; }
    const agent = VOICE_AGENTS.find((a) => a.id === agentId)!;
    setDialing(true);
    toast.loading(`מחייג ל-${targets.length} מתעניינים בקול ${agent.label}…`, { id: 'voice-dial' });
    let ok = 0; let failed = 0;
    try {
      for (const l of targets) {
        if (!l.phone) continue;
        const { error } = await supabase.functions.invoke('vapi-outbound-call', {
          body: {
            phone_number: l.phone,
            lead_id: l.id,
            voice_id: agent.voice_id,
            agent_label: agent.label,
            instructions: instructions.trim() || null,
          },
        });
        if (error) failed++; else ok++;
      }
      toast.dismiss('voice-dial');
      if (ok > 0) toast.success(`נשלחו ${ok} שיחות מ-${formatPhoneDisplay(VOICE_DIAL_NUMBER)}${failed ? ` · ${failed} נכשלו` : ''}`);
      else toast.error('כל השיחות נכשלו');
      onClose();
    } finally {
      setDialing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-[#0f1b3d]">למי מחייגים?</DialogTitle>
          <DialogDescription className="text-right">
            {channel?.label} · מספר חיוג <span dir="ltr" className="font-mono">{VOICE_DIAL_NUMBER}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 — Target List */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">בחירת רשימת מתעניינים</label>
            <Select value={listGroup} onValueChange={setListGroup} dir="rtl">
              <SelectTrigger className="w-full text-right border-[#0f1b3d]/30 focus:ring-[#C9A84C]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">
                  כל הרשימה ({loading ? '…' : leads.length})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Step 2 — AI Agent Voice */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">בחירת נציג/ת AI טלפונית</label>
            <Select value={agentId} onValueChange={setAgentId} dir="rtl">
              <SelectTrigger className="w-full text-right border-[#0f1b3d]/30 focus:ring-[#C9A84C]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {VOICE_AGENTS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="inline-flex items-center gap-2">
                      <Play className="h-3 w-3 text-[#C9A84C]" />
                      {a.label}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="__clone" disabled>+ הוסף קול חדש (שיבוט מהיר / HD)</SelectItem>
                <SelectItem value="__elevenlabs" disabled>+ הוסף קול לפי Voice ID של ElevenLabs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Step 3 — Optional script */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">
              הוראות, נושא או תסריט מותאם לשיחה (אופציונלי)
            </label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder='לדוגמה: "בדקי האם המתעניין עדיין מחפש דירת 4 חדרים ברמת אביב, ועדכני אותו על דירה חדשה שיצאה ברחוב איינשטיין"'
              className="text-right min-h-[88px] border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C]"
            />
            <p className="text-[11px] text-muted-foreground text-right leading-snug">
              אם תשאירי ריק, המערכת תשתמש באסטרטגיה האוטונומית הרגילה שלה המבוססת על הפרסונה של הסוכן, על מאגר הידע ועל היסטוריית השיחות עם המתעניין.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            onClick={dial}
            disabled={dialing || loading || leads.length === 0}
            className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 text-base font-semibold shadow-md"
          >
            <Phone className="ml-2 h-5 w-5" />
            {dialing ? 'מפעיל שיחות…' : 'הפעלת שיחה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


/* ───────────── Page ───────────── */

const CampaignCenter = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { settings } = useWhiteLabel();
  const brandName = settings?.agency_name || 'Realtyz AI';
  const [pickedChannel, setPickedChannel] = useState<ChannelCard | null>(null);
  const [voiceDialChannel, setVoiceDialChannel] = useState<ChannelCard | null>(null);
  const [confirmPayload, setConfirmPayload] = useState<{ body: string; mode: 'now' | 'scheduled'; media_urls: string[]; scheduled_at: string | null; group_ids: string[] } | null>(null);
  const [connectedChannels, setConnectedChannels] = useState<Set<string>>(EMPTY_CONNECTED);
  const [channelAccountNames, setChannelAccountNames] = useState<Record<string, string>>({});

  // STRICT WORKSPACE ISOLATION: only show a channel as connected when
  // (1) this workspace owns a verified `workspace_social_profile` with its
  //     OWN `ayrshare_profile_key` (never a shared/global key), AND
  // (2) the channel exists in `social_connections` for the active user with
  //     `is_connected = true`. Otherwise every card defaults to "חבר".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setConnectedChannels(EMPTY_CONNECTED); return; }

      const { data: wsp } = await supabase
        .from('workspace_social_profile')
        .select('ayrshare_profile_key, facebook_page_name')
        .maybeSingle();
      const hasOwnProfile = !!(wsp as any)?.ayrshare_profile_key;
      if (!hasOwnProfile) { if (!cancelled) setConnectedChannels(EMPTY_CONNECTED); return; }
      const fbName = (wsp as any)?.facebook_page_name as string | null;
      if (fbName && !cancelled) {
        setChannelAccountNames((prev) => ({ ...prev, facebook: fbName }));
      }

      // Auto-sync Ayrshare → social_connections so freshly linked pages appear
      // as connected without requiring a manual "Import accounts" click.
      try { await supabase.functions.invoke('ayrshare-sync-accounts', { body: {} }); } catch { /* non-fatal */ }
      if (cancelled) return;

      const { data: conns } = await supabase
        .from('social_connections')
        .select('platform, is_connected')
        .eq('created_by', user.id)
        .eq('is_connected', true);
      if (cancelled) return;
      const set = new Set<string>();
      (conns || []).forEach((c: any) => {
        const p = String(c.platform || '').toLowerCase();
        if (p.startsWith('facebook')) set.add('facebook');
        else if (p.startsWith('instagram')) set.add('instagram');
        else if (p === 'x' || p === 'twitter') set.add('x');
        else if (p.startsWith('youtube')) set.add('youtube');
        else if (p.startsWith('linkedin')) set.add('linkedin');
        else if (p.startsWith('tiktok')) set.add('tiktok');
      });

      // Direct (non-social) channels: IVR / AI-Call / Email live on profiles
      // AND are auto-derived from api_configs (Vapi/Twilio/Resend) so brokers
      // who configured credentials see them as connected without an extra click.
      const [{ data: prof }, { data: cfgs }] = await Promise.all([
        supabase.from('profiles').select('direct_channels, email_alias, full_name').eq('id', user.id).maybeSingle(),
        supabase.from('api_configs').select('service_name, is_active'),
      ]);
      if (cancelled) return;

      const direct = ((prof as any)?.direct_channels ?? {}) as Record<string, boolean>;
      const alias = (prof as any)?.email_alias as string | null;
      const activeServices = new Set(
        (cfgs || []).filter((r: any) => r.is_active).map((r: any) => String(r.service_name || '').toLowerCase()),
      );
      const hasVapi = activeServices.has('vapi');
      const hasTwilio = activeServices.has('twilio');
      const hasResend = activeServices.has('resend');
      const voiceReady = hasVapi && hasTwilio;

      if (direct.ivr || voiceReady) set.add('ivr');
      if (direct['ai-call'] || hasVapi) set.add('ai-call');
      if ((direct.email && alias) || alias || hasResend) set.add('email');

      if (!cancelled) {
        setChannelAccountNames((prev) => ({
          ...prev,
          ...(alias ? { email: `${alias}@realtyz.co.il` } : hasResend ? { email: 'Resend · אימייל מותג' } : {}),
          ...(voiceReady || direct.ivr ? { ivr: VOICE_DIAL_NUMBER } : {}),
          ...(hasVapi || direct['ai-call'] ? { 'ai-call': VOICE_DIAL_NUMBER } : {}),
        }));
      }

      setConnectedChannels(set);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleConnectChannel = async (c: ChannelCard) => {
    // Direct (non-social) outbound channels — verify creds, then flip
    // the per-broker flag stored on profiles.direct_channels.
    if (c.id === 'ivr' || c.id === 'ai-call') {
      try {
        toast.loading('בודק חיבור Vapi / Twilio…', { id: 'voice-verify' });
        const { data, error } = await supabase.functions.invoke('vapi-verify-credentials', { method: 'POST' });
        toast.dismiss('voice-verify');
        if (error) throw error;
        const v: any = (data as any)?.vapi ?? {};
        if (!v.ok) { toast.error(v.message || 'שגיאת התחברות - בדוק את מפתחות ה-API שלך'); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { toast.error('יש להתחבר'); return; }
        const { data: prof } = await supabase.from('profiles').select('direct_channels').eq('id', user.id).maybeSingle();
        const next = { ...(((prof as any)?.direct_channels ?? {}) as Record<string, boolean>), [c.id]: true };
        const { error: upErr } = await supabase.from('profiles').update({ direct_channels: next }).eq('id', user.id);
        if (upErr) throw upErr;
        setConnectedChannels((prev) => new Set([...prev, c.id]));
        setChannelAccountNames((prev) => ({ ...prev, [c.id]: VOICE_DIAL_NUMBER }));
        toast.success(`${c.label} מחובר ופעיל`);
      } catch (e: any) {
        toast.dismiss('voice-verify');
        toast.error(e?.message || 'שגיאת התחברות - בדוק את מפתחות ה-API שלך');
      }
      return;
    }

    if (c.id === 'email') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('יש להתחבר'); return; }
      const { data: prof } = await supabase.from('profiles').select('email_alias, direct_channels').eq('id', user.id).maybeSingle();
      if (!(prof as any)?.email_alias) {
        toast.error('הגדר prefix לאימייל המותג בפרופיל לפני הפעלת הערוץ');
        return;
      }
      const next = { ...(((prof as any)?.direct_channels ?? {}) as Record<string, boolean>), email: true };
      const { error: upErr } = await supabase.from('profiles').update({ direct_channels: next }).eq('id', user.id);
      if (upErr) { toast.error(upErr.message); return; }
      setConnectedChannels((prev) => new Set([...prev, 'email']));
      setChannelAccountNames((prev) => ({ ...prev, email: `${(prof as any).email_alias}@realtyz.co.il` }));
      toast.success(`אימייל מותג מחובר: ${(prof as any).email_alias}@realtyz.co.il`);
      return;
    }

    const platformMap: Record<string, string> = {
      facebook: 'facebook', instagram: 'instagram', x: 'twitter', twitter: 'twitter',
      youtube: 'youtube', linkedin: 'linkedin', tiktok: 'tiktok',
    };
    const platform = platformMap[c.id];
    if (!platform) {
      toast.error('הערוץ הזה לא נתמך כרגע דרך Ayrshare');
      return;
    }
    try {
      toast.loading('פותח חיבור Ayrshare…', { id: 'ayr-connect' });
      const { data, error } = await supabase.functions.invoke('ayrshare-social-link', { body: { platform } });
      toast.dismiss('ayr-connect');
      if (error) {
        let backendMsg: string | null = null;
        try {
          const resp = (error as any)?.context?.response ?? (error as any)?.context;
          if (resp && typeof resp.json === 'function') {
            const body = await resp.json();
            backendMsg = body?.error || body?.message || null;
          } else if (data && typeof data === 'object' && (data as any).error) {
            backendMsg = (data as any).error;
          }
        } catch { /* ignore */ }
        throw new Error(backendMsg || error.message || 'יצירת חיבור נכשלה');
      }
      const url = (data as any)?.url;
      if (!url) {
        toast.error((data as any)?.error || 'לא התקבל קישור חיבור מ-Ayrshare');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.dismiss('ayr-connect');
      toast.error(e?.message ?? 'יצירת חיבור נכשלה');
    }
  };




  const initial = (searchParams.get('tab') as string) ?? 'create';
  const remapped: TabValue =
    initial === 'campaigns' || initial === 'strategy' || initial === 'send' || initial === 'broadcast'
      ? 'create'
      : initial === 'calendar'
      ? 'published'
      : (initial as TabValue);
  const active: TabValue = TABS.some((t) => t.value === remapped) ? remapped : 'create';

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('sub');
    setSearchParams(next, { replace: true });
  };

  const leadId = searchParams.get('lead') ?? searchParams.get('client') ?? searchParams.get('voter');
  const leadNameParam = searchParams.get('name');
  const fromRaw = searchParams.get('from');
  const fromCrm = fromRaw === 'crm' || fromRaw === 'voter-crm' || fromRaw === 'lead-crm';

  const [leadAvatar, setLeadAvatar] = useState<string | null>(null);
  const [leadFullName, setLeadFullName] = useState<string | null>(null);
  useEffect(() => {
    if (!leadId) { setLeadAvatar(null); setLeadFullName(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('leads').select('full_name, profile_picture_url').eq('id', leadId).maybeSingle();
      if (cancelled) return;
      setLeadAvatar((data as any)?.profile_picture_url ?? null);
      setLeadFullName((data as any)?.full_name ?? null);
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const displayName = leadFullName ?? leadNameParam ?? '';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
  const isTargetedMode = !!leadId && !!displayName;

  return (
    <div className="space-y-6" dir="rtl">
      {isTargetedMode && (
        <div className="relative -mx-3 sm:-mx-6 -mt-6 mb-2 overflow-hidden text-primary-foreground"
             style={{ backgroundColor: 'hsl(var(--header-bg))' }} data-no-hero-wave>
          <div className="relative z-10 grid items-center px-4 sm:px-6"
               style={{ minHeight: '88px', gridTemplateColumns: '1fr auto 1fr' }}>
            <div className="flex justify-start">
              <Button variant="ghost" size="icon"
                onClick={() => fromCrm ? navigate(`/lead-crm?lead=${encodeURIComponent(leadId!)}`) : navigate('/lead-crm')}
                className="text-primary-foreground hover:bg-primary-foreground/10" aria-label="חזרה לפרופיל המתעניין">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-primary-foreground/40 shrink-0">
                {leadAvatar ? <AvatarImage src={leadAvatar} alt={displayName} /> : null}
                <AvatarFallback className="bg-primary-foreground/15 text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap">{displayName}</h1>
            </div>
            <div />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6">
            <RealtyzWave position="bottom" variant="wave-soft" fill="hsl(var(--background))" seed={7} />
          </div>
        </div>
      )}

      <SentimentAutomationToggles className="mt-[15px] mb-4" />

      <Tabs value={active} onValueChange={handleChange} className="w-full">
        <div className="sticky top-0 z-30 -mx-6 px-6 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60">
          <TabsList className="flex w-full h-auto gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="flex-1 min-w-fit whitespace-nowrap px-3 py-2 text-base sm:text-lg font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="create" className="mt-6 space-y-4">
          <ChannelGrid
            selectedId={pickedChannel?.id ?? null}
            onPick={(c) => {
              if (c.id === 'ivr' || c.id === 'ai-call') {
                setVoiceDialChannel(c);
              } else {
                setPickedChannel(c);
              }
            }}
            onConnect={handleConnectChannel}
            brandName={brandName}
            connected={connectedChannels}
            accountNames={channelAccountNames}
          />
          {pickedChannel && (
            <InlineComposer
              channel={pickedChannel}
              brandName={brandName}
              onConfirm={(p) => setConfirmPayload(p)}
            />
          )}
        </TabsContent>
        <TabsContent value="published" className="mt-6">
          <PublishedFeed />
        </TabsContent>
      </Tabs>

      <ConfirmDispatchDialog
        open={!!confirmPayload}
        onClose={() => setConfirmPayload(null)}
        channel={pickedChannel}
        body={confirmPayload?.body ?? ''}
        brandName={brandName}
        mediaUrls={confirmPayload?.media_urls ?? []}
        scheduledAt={confirmPayload?.scheduled_at ?? null}
        groupIds={confirmPayload?.group_ids ?? []}
        onConfirmed={() => { setConfirmPayload(null); setPickedChannel(null); }}
      />
      <VoiceLeadPickerDialog
        open={!!voiceDialChannel}
        onClose={() => setVoiceDialChannel(null)}
        channel={voiceDialChannel}
      />
    </div>
  );
};


export default CampaignCenter;
