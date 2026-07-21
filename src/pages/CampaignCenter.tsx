import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { formatPhoneDisplay } from '@/lib/formatPhone';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrandIcon } from '@/components/BrandIcon';
import {
  ArrowRight, Plus, Bot, Mail, Phone, MessageSquare, Heart, Share2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Send, Mic, Image as ImageIcon, Paperclip,
  ChevronDown as ChevronDownIcon, Plug, Camera, Sparkles, Square,
  Trash2, ExternalLink, CheckCircle2, Play, RefreshCw, Calendar as CalendarIcon, Loader2, AlertTriangle, Pencil,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


import { supabase } from '@/integrations/supabase/client';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SentimentAutomationToggles } from '@/components/automation/SentimentAutomationToggles';
import { CampaignCommentsStream } from '@/components/campaigns/CampaignCommentsStream';
import EditRepostDialog from '@/components/campaigns/EditRepostDialog';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';
import { CustomGroupsQuickShare } from '@/components/social/CustomGroupsQuickShare';
import { CampaignGroupBreakdown } from '@/components/social/CampaignGroupBreakdown';
import { campaignMatchesExternalPost, normalizePostId, getCampaignPostIds, platformForCampaignChannel } from '@/lib/campaignPostIds';
import { learnFromEdit } from '@/lib/learnFromEdit';
import { uploadMediaToLibrary } from '@/lib/mediaUpload';
import { stripAddressNumbers } from '@/lib/formatAddress';
import { IvrBroadcastDialog } from '@/components/campaigns/IvrBroadcastDialog';
import { EmailAliasSetupDialog } from '@/components/campaigns/EmailAliasSetupDialog';
import { ScheduledCampaignCalendar } from '@/components/campaigns/ScheduledCampaignCalendar';
import { ScheduleCurrentPostDialog } from '@/components/campaigns/ScheduleCurrentPostDialog';

import { getCampaignWorkspaceUserIds } from '@/lib/campaignWorkspace';


type TabValue = 'create' | 'published' | 'calendar';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'create',    label: 'צור קמפיין' },
  { value: 'published', label: 'פורסמו' },
  { value: 'calendar',  label: 'לוח שנה' },
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

type SocialAccountProfile = {
  id: string;
  platform: string;
  accountRef: string;
  profileKey: string | null;
  name: string;
  username: string | null;
  avatar: string | null;
  profileUrl: string | null;
};

type ConfirmPayload = {
  body: string;
  original_ai_body: string;
  listing_id: string | null;
  mode: 'now' | 'scheduled';
  media_urls: string[];
  scheduled_at: string | null;
  group_ids: string[];
  selected_profile_ids: string[];
  attach_wa_link: boolean;
  first_comment: string;
  first_comment_enabled: boolean;
  attach_msngr_link: boolean;
};

const isRenderablePostMediaUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const facebookPagePaths = ['/photo.php', '/permalink.php', '/share/', '/posts/', '/videos/', '/watch'];
    if ((host === 'facebook.com' || host.endsWith('.facebook.com')) && facebookPagePaths.some((p) => path.startsWith(p))) {
      return false;
    }
    return /\.(jpg|jpeg|png|webp|gif|avif|mp4|mov|m4v)(\?|$)/i.test(url)
      || host.includes('fbcdn.net')
      || host.includes('cdninstagram.com');
  } catch {
    return false;
  }
};

const mediaDedupeKey = (url: string): string => {
  try {
    const u = new URL(url);
    const filename = u.pathname.split('/').pop() || u.pathname;
    return filename.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
};

const normalizePostMediaUrls = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of source) {
    if (!isRenderablePostMediaUrl(item)) continue;
    const key = mediaDedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
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
const SOCIAL_CHANNEL_IDS = new Set(['facebook', 'instagram', 'x', 'youtube', 'linkedin', 'tiktok']);

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

// Build a public URL to open a connected account/page in a new tab.
// `value` is whatever was stored in accountNames (handle, page name, page id,
// phone, or email depending on the channel).
const buildAccountUrl = (channelId: string, value: string): string | null => {
  const v = (value || '').trim();
  if (!v) return null;
  const handle = v.replace(/^@+/, '');
  const isAllDigits = /^\d+$/.test(handle);
  switch (channelId) {
    case 'facebook':
      return `https://www.facebook.com/${encodeURIComponent(handle)}`;
    case 'instagram':
      return `https://www.instagram.com/${encodeURIComponent(handle)}`;
    case 'x':
      return `https://x.com/${encodeURIComponent(handle)}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
    case 'youtube':
      return handle.startsWith('UC')
        ? `https://www.youtube.com/channel/${encodeURIComponent(handle)}`
        : `https://www.youtube.com/@${encodeURIComponent(handle)}`;
    case 'linkedin':
      return isAllDigits
        ? `https://www.linkedin.com/company/${encodeURIComponent(handle)}`
        : `https://www.linkedin.com/in/${encodeURIComponent(handle)}`;
    case 'email':
      return v.includes('@') ? `mailto:${v}` : null;
    default:
      return null;
  }
};



const ChannelGrid = ({
  selectedIds, onPick, onConnect, brandName, connected = EMPTY_CONNECTED, accountNames = {}, socialProfiles = [], onAddFacebookPage,
}: {
  selectedIds: Set<string>;
  onPick: (c: ChannelCard) => void;
  onConnect: (c: ChannelCard) => void;
  brandName: string;
  connected?: Set<string>;
  accountNames?: Record<string, string>;
  socialProfiles?: SocialAccountProfile[];
  onAddFacebookPage?: (preOpened: Window | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedIds.size;
  const connectedCards = CHANNEL_CARDS.filter((c) => connected.has(c.id));
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1" dir="rtl">
          {[
            { id: 'facebook',  label: 'Facebook',  brand: 'facebook' },
            { id: 'instagram', label: 'Instagram', brand: 'instagram' },
            { id: 'x',         label: 'X',         brand: 'x' },
            { id: 'tiktok',    label: 'TikTok',    brand: 'tiktok' },
            { id: 'linkedin',  label: 'LinkedIn',  brand: 'linkedin' },
            { id: 'youtube',   label: 'YouTube',   brand: 'youtube' },
          ].map((p) => {
            const isConnected = connected.has(p.id);
            const count = selectedIds.has(p.id) ? 1 : 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen((v) => !v)}
                title={p.label}
                aria-label={p.label}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-opacity',
                  !isConnected && 'opacity-40 grayscale',
                )}
              >
                <BrandIcon
                  name={p.brand}
                  aria-label={p.label}
                  className={cn('h-5 w-5', isConnected ? (BRAND_COLOR[p.id] ?? 'text-slate-600') : 'text-slate-500')}
                />
                
              </button>
            );
          })}
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-transparent hover:text-foreground focus-visible:text-foreground active:text-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="grid grid-cols-3 md:grid-cols-9 gap-2 pt-4" dir="rtl">
          {CHANNEL_CARDS.map((c) => {
            const Icon = c.icon;
            const isSelected = selectedIds.has(c.id);
            const isConnected = connected.has(c.id);
            const brandColor = isConnected ? (BRAND_COLOR[c.id] ?? c.iconColor ?? 'text-foreground') : 'text-muted-foreground/60';
            const profiles = socialProfiles.filter((p) => p.platform === c.id || (c.id === 'x' && p.platform === 'twitter'));
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
                {isConnected && isSelected && (
                  <span aria-hidden className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-primary" title="נבחר">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                )}

                {c.id === 'facebook' && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); const w = window.open('about:blank', '_blank', 'noopener,noreferrer'); onAddFacebookPage?.(w); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const w = window.open('about:blank', '_blank', 'noopener,noreferrer'); onAddFacebookPage?.(w); } }}
                    className="absolute left-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full text-[#0a2540] hover:text-[#0a2540]/80"
                    title="הוסף עמוד נוסף"
                    aria-label="הוסף עמוד נוסף"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.75} />
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


                {isConnected && profiles.length > 0 ? (
                  <span className="mt-0.5 flex w-full flex-col gap-1 overflow-hidden">
                    {profiles.slice(0, 2).map((profile) => {
                      const url = profile.profileUrl || buildAccountUrl(c.id, profile.accountRef || profile.name);
                      const handleOpen = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      };
                      return (
                        <span key={profile.id} className="block max-w-full text-center">
                          <span
                            role={url ? 'link' : undefined}
                            tabIndex={url ? 0 : undefined}
                            onClick={url ? handleOpen : undefined}
                            onKeyDown={url ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen(e as unknown as React.MouseEvent); } : undefined}
                            className={cn('block truncate text-[10px] font-bold text-[#8a7327]', url && 'cursor-pointer hover:underline')}
                            title={profile.name}
                          >
                            {profile.name}
                          </span>
                        </span>
                      );
                    })}
                    {profiles.length > 2 && <span className="text-[9px] font-semibold text-muted-foreground">+{profiles.length - 2}</span>}
                  </span>
                ) : isConnected && accountNames[c.id] && (() => {
                  const raw = accountNames[c.id];
                  // Strip any "Realtyz Workspace - " prefix, trailing "- 1234" numeric ids,
                  // and profile-key / refId tokens so only the human page name remains.
                  const cleaned = String(raw)
                    .replace(/^Realtyz Workspace\s*[-–]\s*/i, '')
                    .replace(/\s*[-–]\s*\d{2,}$/, '')
                    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4,}\b/gi, '')
                    .replace(/\b[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}\b/g, '')
                    .trim();
                  const display = formatPhoneDisplay(cleaned) || cleaned || raw;

                  const url = buildAccountUrl(c.id, raw);
                  const handleOpen = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  };
                  return (
                    <span
                      role={url ? 'link' : undefined}
                      tabIndex={url ? 0 : undefined}
                      onClick={url ? handleOpen : undefined}
                      onKeyDown={url ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen(e as unknown as React.MouseEvent); } : undefined}
                      className={cn(
                        'mt-0.5 inline-block max-w-full truncate rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#8a7327]',
                        url && 'cursor-pointer hover:bg-[#C9A84C]/20 hover:underline',
                      )}
                      dir="ltr"
                      title={url ? `פתח: ${display}` : display}
                    >
                      {display}
                    </span>
                  );
                })()}


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
      </CollapsibleContent>
    </Collapsible>
  );
};



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
  media_photos: unknown;
  status: string | null;
  is_published: boolean | null;
  created_at: string | null;
};

// Extract image URLs from a listing row (media_photos + source_metadata fallbacks).
const extractListingPhotoUrls = (listing: CampaignListing | null | undefined): string[] => {
  if (!listing) return [];
  const meta = (listing.source_metadata || {}) as Record<string, unknown>;
  const pull = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      const o = v as any;
      return o.url || o.src || o.photo || o.image_url || o.image || null;
    }
    return null;
  };
  const sources: unknown[] = [
    ...(Array.isArray(listing.media_photos) ? (listing.media_photos as unknown[]) : []),
    ...(Array.isArray((meta as any).photos) ? ((meta as any).photos as unknown[]) : []),
    ...(Array.isArray((meta as any).images) ? ((meta as any).images as unknown[]) : []),
  ];
  if (typeof (meta as any).image === 'string') sources.push((meta as any).image);
  if (typeof (meta as any).image_url === 'string') sources.push((meta as any).image_url);
  const urls = sources.map(pull).filter((s): s is string => !!s && /^https?:\/\//i.test(s));
  return Array.from(new Set(urls));
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
  const location = [stripAddressNumbers(listing.address) || listing.property_title || 'נכס', listing.city].filter(Boolean).join(', ');
  const price = listing.asking_price ? `${Number(listing.asking_price).toLocaleString('he-IL')} ₪` : null;
  return price ? `${location} — ${price}` : location;
};

const oldListingPostCommentPattern = /(מה תמצאו|מחיר מבוקש|ר\.מ|ברחוב\s|📍|💰|📞|^\s*✅)/m;

const cleanFirstComment = (value: string) => String(value || '')
  .replace(/^```[a-z]*\s*/i, '')
  .replace(/```$/i, '')
  .replace(/^\s*[-*•]\s+/gm, '')
  .replace(/^\s*\d+[.)]\s+/gm, '')
  .replace(/^\s*[✅📍💰📞]\s*/gm, '')
  .replace(/[#*_`]+/g, '')
  .replace(/[—–]/g, ',')
  .replace(/--+/g, ',')
  // Strip any broker signature / phone / license lines that the model may have produced.
  .replace(/\n*\s*אודי\s+ויטמן[^\n]*/gu, '')
  .replace(/\n*\s*(?:📞|☎️|📱)?\s*0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}[^\n]*/gu, '')
  .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, '')
  .replace(/\n*\s*רישיון\s*תיווך[^\n]*/gu, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const extractListingFeatureFlags = (listing: CampaignListing | null | undefined) => {
  if (!listing) return [] as string[];
  const bag: string[] = [];
  const push = (val: unknown) => {
    if (!val) return;
    if (typeof val === 'string') bag.push(val);
    else if (typeof val === 'number') bag.push(String(val));
  };
  const scan = (obj: Record<string, unknown> | null | undefined) => {
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined || v === false || v === '' || v === 0) continue;
      const key = k.toLowerCase();
      if (/balcony|מרפסת/.test(key)) bag.push('מרפסת');
      else if (/elevator|מעלית/.test(key)) bag.push('מעלית');
      else if (/parking|חני/.test(key)) bag.push('חניה');
      else if (/shower|bath|אמבט|מקלח/.test(key)) bag.push(typeof v === 'number' ? `${v} חדרי רחצה` : 'חדר רחצה');
      else if (/air.?cond|מזגן|מיזוג/.test(key)) bag.push('מיזוג');
      else if (/storage|מחסן/.test(key)) bag.push('מחסן');
      else if (/safe.?room|ממ"?ד|ממד/.test(key)) bag.push('ממ"ד');
      else if (/garden|גינה/.test(key)) bag.push('גינה');
      else if (/pool|בריכה/.test(key)) bag.push('בריכה');
      else if (/view|נוף/.test(key)) bag.push('נוף');
      else if (/renovated|משופצ/.test(key)) bag.push('משופצת');
      else if (/furnished|מרוהט/.test(key)) bag.push('מרוהטת');
    }
  };
  scan(listing.source_metadata as Record<string, unknown> | null);
  if (Array.isArray(listing.features)) {
    for (const f of listing.features as unknown[]) {
      if (typeof f === 'string') push(f);
      else if (f && typeof f === 'object') scan(f as Record<string, unknown>);
    }
  } else if (listing.features && typeof listing.features === 'object') {
    scan(listing.features as Record<string, unknown>);
  }
  // dedupe preserve order
  return Array.from(new Set(bag.map((s) => s.trim()).filter(Boolean)));
};

const buildFirstCommentKeywordLine = (listing: CampaignListing | null | undefined) => {
  if (!listing) return '';
  const meta = (listing.source_metadata || {}) as Record<string, unknown>;
  const featuresObj = (listing.features && !Array.isArray(listing.features) && typeof listing.features === 'object')
    ? (listing.features as Record<string, unknown>)
    : {};
  const sourceType = String(meta.property_type || featuresObj.property_type || '') || 'דירה';
  const parts = [
    sourceType,
    listing.city ? String(listing.city) : null,
    listing.address ? stripAddressNumbers(listing.address) : (listing.neighborhood ? String(listing.neighborhood) : null),
    listing.rooms ? `${listing.rooms} חדרים` : null,
    listing.floor !== null && listing.floor !== undefined ? `קומה ${listing.floor}` : null,
    listing.sqm ? `${listing.sqm} מ"ר` : null,
    ...extractListingFeatureFlags(listing),
  ].filter(Boolean) as string[];
  return Array.from(new Set(parts.map((s) => s.trim()))).join(' | ');
};

const buildFallbackFirstComment = (listing: CampaignListing | null) => {
  const city = normalizeListingText(listing?.city) || 'הרצליה';
  const neighborhood = normalizeListingText(listing?.neighborhood);
  const rooms = listing?.rooms ? `${listing.rooms} חדרים` : '';
  const location = [neighborhood, city].filter(Boolean).join(', ') || city;
  const keywordLine = buildFirstCommentKeywordLine(listing);
  const propertyPhrase = rooms ? `דירת ${rooms} ב${location}` : `נכס ב${location}`;
  const variants = [
    `${propertyPhrase} — הזדמנות שכדאי לראות לפני שמקבלים החלטה.`,
    `${propertyPhrase} עם מיקום נכון ופוטנציאל אמיתי למי שמחפש איכות חיים.`,
    `${propertyPhrase} שמשלב מיקום, נוחות ואופי — שווה ביקור.`,
  ];
  const oneLiner = variants[Math.floor(Math.random() * variants.length)];
  return `${oneLiner}\n${keywordLine}`.trim();
};

const InlineComposer = ({
  channel, brandName, socialProfiles = [], onConfirm, onOpenScheduleCalendar,
  presetListingId, presetScheduleIso, presetVariant, presetVariants, instanceId,
}: {
  channel: ChannelCard;
  brandName: string;
  socialProfiles?: SocialAccountProfile[];
  onConfirm: (payload: ConfirmPayload) => void;
  onOpenScheduleCalendar?: () => void;
  presetListingId?: string | null;
  presetScheduleIso?: string | null;
  presetVariant?: number;
  presetVariants?: number;
  instanceId?: string;
}) => {
  // Persistent draft key — namespaced per replicated instance so multiple
  // composers on the same page don't clobber each other's drafts. Persisted
  // to localStorage so dialog closes, route changes, and hard refreshes
  // never lose unfinished work. Cleared only on successful publish.
  const draftKey = `rz-composer-draft:v2:${channel.id}${instanceId ? `:${instanceId}` : ''}`;
  const readDraft = (): any => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(draftKey) || sessionStorage.getItem(draftKey) || 'null'); } catch { return null; }
  };
  // Strip any auto-generated WhatsApp CTA line the AI (or a stale draft) may
  // emit. The CTA is now opt-in via the "הוסף קישור לוואטסאפ" checkbox and
  // is appended at publish-time only.
  const stripWaCta = (s: string) =>
    s
      // Any line that opens with "דברו איתי/איתנו" (with or without emoji/lead)
      .replace(/\n*[^\n]*דברו אית(?:י|נו)[^\n]*/g, '')
      // Common variation openers we cycle through — strip them too so re-toggle
      // doesn't leave the previous variant behind.
      .replace(/\n*[^\n]*(?:לפרטים נוספים|מוזמנים לפנות|רוצה לשמוע עוד|לתיאום ביקור|שולחים הודעה|קופצים לוואטסאפ|הכי מהיר בוואטסאפ)[^\n]*/g, '')
      .replace(/\n*[^\n]*realtyz\.co\.il\/r\/[a-z0-9]+[^\n]*/gi, '')
      .replace(/\n*[^\n]*wa\.me\/[0-9]+[^\n]*/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const cleanBody = (s: string) =>
    stripWaCta(s).replace(/^[\s\u200f\u200e]+/g, '');


  // Rotating CTA copy pool — never reuse the same opener twice in a row so
  // Facebook's anti-spam heuristics don't flag repetitive posting patterns.
  // Always in first-person ("דברו איתי") per brand voice.
  const WA_CTA_VARIANTS = [
    'דברו איתי בוואטסאפ 👇',
    'לפרטים נוספים — דברו איתי כאן:',
    'מוזמנים לפנות אליי ישירות בוואטסאפ:',
    'רוצה לשמוע עוד? דברו איתי:',
    'לתיאום ביקור — דברו איתי בוואטסאפ:',
    'שולחים הודעה ומדברים איתי:',
    'קופצים לוואטסאפ ומדברים איתי:',
    'הכי מהיר בוואטסאפ — דברו איתי:',
  ] as const;
  const pickWaCtaOpener = () => {
    try {
      const lastKey = 'rz:last-wa-cta';
      const last = typeof window !== 'undefined' ? window.localStorage.getItem(lastKey) : null;
      const pool = WA_CTA_VARIANTS.filter((v) => v !== last);
      const pick = pool[Math.floor(Math.random() * pool.length)] || WA_CTA_VARIANTS[0];
      if (typeof window !== 'undefined') window.localStorage.setItem(lastKey, pick);
      return pick;
    } catch {
      return WA_CTA_VARIANTS[Math.floor(Math.random() * WA_CTA_VARIANTS.length)];
    }
  };

  const initial = readDraft() || {};

  const [body, setBody] = useState<string>(cleanBody(initial.body || ''));
  // Opt-in WhatsApp CTA (now attached to the FIRST COMMENT, not the main post).
  const [attachWaLink, setAttachWaLink] = useState<boolean>(!!initial.attachWaLink);
  const [attachMsngrLink, setAttachMsngrLink] = useState<boolean>(!!initial.attachMsngrLink);
  // First-comment auto-post: when enabled, the branded first-comment text is
  // posted as the first comment on the published post via Ayrshare.
  const [firstCommentEnabled, setFirstCommentEnabled] = useState<boolean>(initial.firstCommentEnabled ?? true);
  const [firstComment, setFirstComment] = useState<string>(initial.firstComment || '');
  const [firstCommentGenerating, setFirstCommentGenerating] = useState<boolean>(false);
  // Preview shortlinks generated the moment the WA / Messenger link options are
  // toggled on, so the user can see the exact URL that will be appended to the
  // first comment at publish time.
  const [waShortUrl, setWaShortUrl] = useState<string>('');
  const [msngrShortUrl, setMsngrShortUrl] = useState<string>('');
  const firstCommentRef = useRef<HTMLTextAreaElement | null>(null);
  // Tracks the exact CTA line we injected into the first-comment textarea so
  // toggling the checkbox off cleanly removes only that line.
  const waInjectedRef = useRef<string>('');
  const msngrInjectedRef = useRef<string>('');
  // Image lightbox for the attachments grid.
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // Tracks the last AI-generated body so manual edits before publish can be
  // shipped to learn-from-edit on success. Reset on send.
  const [originalAiBody, setOriginalAiBody] = useState<string>('');
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  // Local datetime string in `YYYY-MM-DDTHH:mm` (input[type=datetime-local] format).
  const [scheduledLocal, setScheduledLocal] = useState<string>('');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState<boolean>(false);

  // Preset from props (multi-property replicas) OR ?schedule=ISO so the calendar
  // can deep-link the composer. Run once per mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const iso = presetScheduleIso || params.get('schedule');
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setScheduledLocal(local);
        setMode('scheduled');
      }
    }
    const listingParam = presetListingId ?? params.get('listing');
    if (listingParam) setSelectedListingId(listingParam);
    const variant = presetVariant ?? Number(params.get('variant') || '');
    const variants = presetVariants ?? Number(params.get('variants') || '');
    if (variant > 0 && variants > 1) {
      // Anti-ban variation directive — Facebook/Ayrshare will throttle or
      // shadow-block accounts that repost identical payloads. Every recurring
      // variant must be a fully distinct human-written copy.
      const structures = ['סיפור-פתיחה רגשי קצר', 'רשימת בולטים של יתרונות', 'וו-דחיפות עם CTA חד', 'נקודת מבט של תושב השכונה', 'שאלה פתוחה לקהל'];
      const greetings = ['שלום', 'היי', 'בוקר טוב', 'ערב טוב', 'חברים'];
      const ctas = ['השאירו פרטים בפרטי', 'מוזמנים להתקשר', 'תיאום ביקור בלינק', 'שלחו הודעה לפרטים נוספים', 'דברו איתי לפני שזה רץ'];
      const pricingFrames = ['ציון מחיר ישיר', 'מחיר כיתרון יחס שכונתי', 'מחיר כסיפור הזדמנות', 'מחיר ללא קישוט עם הקשר שוק'];
      const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
      const hint = [
        `וריאציה ${variant} מתוך ${variants} — כתוב גרסה אחרת לחלוטין בזווית, פתיחה, מבנה וניסוח. אסור לחזור על משפטי פתיחה או על אותה ה-CTA של הוריאציות הקודמות.`,
        `מבנה נדרש לוריאציה זו: ${pick(structures)}.`,
        `פתיחה: התחל ב"${pick(greetings)}…" (אל תחזור על פתיחה זהה בין וריאציות).`,
        `הצגת מחיר: ${pick(pricingFrames)}.`,
        `CTA לסיום: ${pick(ctas)}.`,
        'טון אנושי וגולמי של מתווך אמיתי: ללא ניסוחים גנריים, ללא הצפת אמוג׳ים, ללא חתימה מלאכותית. אסור להעתיק משפטים שלמים מוריאציות אחרות.',
        'אקראיות מבנית: ערבב סדר פסקאות, אורכי משפט, ובחירת אמוג׳ים (0–3 לכל הפוסט). אסור שתי וריאציות יחלקו מבנה פסקה זהה — חובה לעמוד במדיניות אנטי-ספאם של פייסבוק.',
      ].join('\n');
      setCustomInstructions((prev) => (prev && prev.includes('אנטי-ספאם') ? prev : (prev ? `${prev}\n\n${hint}` : hint)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Multi-select of connected Facebook Group IDs to fan-out a single post to.
  // Persisted to localStorage so a reload / background refresh doesn't wipe the selection.
  const [groupIds, setGroupIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('campaign:groupIds');
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('campaign:groupIds', JSON.stringify(groupIds)); } catch {}
  }, [groupIds]);
  const platformProfiles = useMemo(
    () => socialProfiles.filter((p) => p.platform === channel.id || (channel.id === 'x' && p.platform === 'twitter')),
    [socialProfiles, channel.id],
  );
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  useEffect(() => {
    if (channel.id !== 'facebook') { setSelectedProfileIds([]); return; }
    const activeIds = platformProfiles.map((p) => p.id);
    setSelectedProfileIds((prev) => {
      const kept = prev.filter((id) => activeIds.includes(id));
      return kept.length > 0 ? kept : activeIds;
    });
  }, [channel.id, platformProfiles]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [generating, setGenerating] = useState(false);
  const [finalizingBody, setFinalizingBody] = useState(false);

  const finalizeBody = async () => {
    const edited = body.trim();
    if (!edited) return;
    setFinalizingBody(true);
    try {
      const { data, error } = await supabase.functions.invoke('finalize-text', {
        body: {
          edited_text: edited,
          original_text: originalAiBody,
          context: [
            `Platform: ${channel.label}`,
            customInstructions ? `Broker instructions: ${customInstructions}` : null,
            selectedListing?.property_title ? `Promoted listing: ${selectedListing.property_title}` : null,
          ].filter(Boolean).join('\n\n'),
          purpose: 'social_post',
          // Signals the backend that no property is attached — the broker
          // license footer must be OMITTED for general/brand posts.
          listing_id: selectedListingId ?? null,
        },
      });
      if (error) throw error;
      const finalText = (data as any)?.final_text;
      if (typeof finalText !== 'string' || !finalText.trim()) {
        throw new Error((data as any)?.error || 'לא התקבלה גרסה סופית');
      }
      const baseline = originalAiBody;
      const editedBeforeFinal = edited;
      const next = cleanBody(finalText);
      setBody(next);
      setBodyManuallyEdited(false);
      setOriginalAiBody(next);

      learnFromEdit({
        context: `campaign_post_finalize:${channel.id}`,
        pairs: [
          { label: 'post_user_edit', original: baseline, edited: editedBeforeFinal },
          { label: 'post_final_polish', original: editedBeforeFinal, edited: next },
        ],
      });
      toast.success('נוצרה גרסה סופית');
    } catch (e: any) {
      toast.error(e?.message || 'יצירת גרסה סופית נכשלה');
    } finally {
      setFinalizingBody(false);
    }
  };

  // Custom AI generation context (broker steering inputs)
  const [customInstructions, setCustomInstructions] = useState<string>(initial.customInstructions || '');
  const [listingQuery, setListingQuery] = useState('');
  const [listings, setListings] = useState<CampaignListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(initial.selectedListingId ?? null);
  const [listingPickerOpen, setListingPickerOpen] = useState(false);
  const [bodyManuallyEdited, setBodyManuallyEdited] = useState(false);


  // Attachment / media state
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ name: string; kind: 'image' | 'file' | 'audio'; url?: string }[]>(initial.attachments || []);
  const [generatingImage, setGeneratingImage] = useState(false);


  // Audio recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Generation history (now also tracks edits + attachments per row)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; topic: string | null; generated_text: string | null; platform: string | null; created_at: string; updated_at: string | null; media_urls: any; listing_id: string | null }>>([]);
  // ID of the currently active history row — edits flow back into the same row.
  const [logId, setLogId] = useState<string | null>(initial.logId ?? null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Persist composer draft to localStorage so collapsing/switching tabs,
  // closing dialogs, navigating away, or hard-refreshing never loses work.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        body,
        customInstructions,
        selectedListingId,
        attachments,
        logId,
        firstComment,
        firstCommentEnabled,
        attachWaLink,
        attachMsngrLink,
      }));
    } catch {}
  }, [draftKey, body, customInstructions, selectedListingId, attachments, logId, firstComment, firstCommentEnabled, attachWaLink, attachMsngrLink]);

  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('ai_content_logs')
        .select('id, topic, generated_text, platform, created_at, updated_at, media_urls, listing_id')
        .eq('created_by', user.id)
        .eq('platform', channel.id)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (!cancelled) setHistory((data as any) || []);
    })();
    return () => { cancelled = true; };
  }, [historyOpen, historyRefresh, channel.id]);

  // On channel change: rehydrate from saved draft for that channel (keeps unfinished work alive per platform)
  useEffect(() => {
    const saved = readDraft() || {};
    setBody(cleanBody(saved.body || ''));
    setCustomInstructions(saved.customInstructions || '');
    setSelectedListingId(saved.selectedListingId ?? null);
    setAttachments(saved.attachments || []);
    setLogId(saved.logId ?? null);
    setFirstComment(saved.firstComment || '');
    setFirstCommentEnabled(saved.firstCommentEnabled ?? true);
    setAttachWaLink(!!saved.attachWaLink);
    setAttachMsngrLink(!!saved.attachMsngrLink);
    setMode('now');
    setListingQuery('');
    setSaveState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);


  // Auto-save: persist edits + attachments + selected property to ai_content_logs (debounced).
  // Creates a new row on first edit if no logId yet; otherwise updates the active row.
  useEffect(() => {
    if (!body.trim() && attachments.length === 0) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const payload = {
          generated_text: body,

          // Persist only durable https URLs — local blob: previews die on reload
          // and would render as empty file chips after restoring from history.
          media_urls: attachments
            .filter((a) => a.url && !a.url.startsWith('blob:'))
            .map((a) => ({ name: a.name, kind: a.kind, url: a.url })),
          listing_id: selectedListingId,
          updated_at: new Date().toISOString(),
        };
        if (logId) {
          await supabase.from('ai_content_logs').update(payload).eq('id', logId);
        } else {
          const { data, error } = await supabase
            .from('ai_content_logs')
            .insert({
              topic: (body.trim().slice(0, 80) || 'טיוטה').slice(0, 500),
              platform: channel.id,
              created_by: user.id,
              ...payload,
            })
            .select('id')
            .single();
          if (error) throw error;
          if (data?.id) setLogId(data.id);
        }
        setSaveState('saved');
        setHistoryRefresh((n) => n + 1);
      } catch (e) {
        console.warn('[CampaignCenter] autosave failed', e);
        setSaveState('idle');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [body, attachments, selectedListingId, logId, channel.id]);

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
            .select('id, property_title, description, city, neighborhood, address, rooms, sqm, floor, asking_price, features, source_metadata, media_photos, status, is_published, created_at')
            .eq('status', 'live')
            .eq('is_published', true)
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

  useEffect(() => {
    if (!firstComment || !oldListingPostCommentPattern.test(firstComment)) return;
    setFirstComment(buildFallbackFirstComment(selectedListing as CampaignListing | null));
  }, [firstComment, selectedListingId, selectedListing?.city, selectedListing?.neighborhood, selectedListing?.rooms, selectedListing?.property_title]);

  const visibleListings = useMemo(() => {
    const q = normalizeListingText(listingQuery).toLowerCase();
    const deduped = dedupeListings(listings);
    if (!q) return deduped;
    return deduped.filter((listing) => listingSearchText(listing).includes(q));
  }, [listings, listingQuery]);


  const handleFiles = async (files: FileList | null, kind: 'image' | 'file') => {
    if (!files) return;
    const max = 25 * 1024 * 1024;
    const list = Array.from(files);
    // Show instant local previews so the UI feels snappy; we'll swap in the
    // persistent https URL once the upload finishes.
    const placeholders = list
      .filter((f) => f.size <= max)
      .map((f) => ({ name: f.name, kind, url: URL.createObjectURL(f), _pending: true as const }));
    list.forEach((f) => { if (f.size > max) toast.error(`${f.name}: גודל מעל 25MB`); });
    if (!placeholders.length) return;
    setAttachments((a) => [...a, ...placeholders]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('יש להתחבר כדי להעלות קבצים'); return; }
      const uploaded = await Promise.all(
        placeholders.map(async (p, idx) => {
          const file = list.filter((f) => f.size <= max)[idx];
          const row = await uploadMediaToLibrary({
            userId: user.id,
            fileName: file.name,
            data: file,
            mimeType: file.type,
            source: 'campaign_composer',
          });
          return { placeholder: p, url: row.public_url };
        }),
      );
      let nextAttachments: typeof attachments = [];
      setAttachments((curr) => {
        nextAttachments = curr.map((att) => {
          const hit = uploaded.find((u) => u.placeholder.url === att.url);
          return hit ? { name: att.name, kind: att.kind, url: hit.url } : att;
        });
        return nextAttachments;
      });
      // Synchronous persistence: as soon as the public URL is available,
      // write it into the ai_content_logs row so the media stays bound to
      // the record even if the view refreshes before the debounced autosave
      // fires.
      try {
        const durableMedia = nextAttachments
          .filter((a) => a.url && !a.url.startsWith('blob:'))
          .map((a) => ({ name: a.name, kind: a.kind, url: a.url }));
        if (logId) {
          await supabase.from('ai_content_logs')
            .update({ media_urls: durableMedia, updated_at: new Date().toISOString() })
            .eq('id', logId);
        } else {
          const { data: inserted } = await supabase.from('ai_content_logs').insert({
            topic: (body.trim().slice(0, 80) || 'טיוטה').slice(0, 500),
            generated_text: body,
            platform: channel.id,
            created_by: user.id,
            media_urls: durableMedia,
            listing_id: selectedListingId,
          }).select('id').single();
          if (inserted?.id) setLogId(inserted.id);
        }
      } catch (persistErr) {
        console.warn('[CampaignCenter] immediate media persist failed', persistErr);
      }
    } catch (err: any) {
      console.error('[CampaignCenter] media upload failed', err);
      toast.error('העלאת הקובץ נכשלה — לא יישמר בטיוטה');
    }
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
    if (!el) { setBody((b) => cleanBody(b + ' ' + tag)); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = cleanBody(body.slice(0, start) + tag + body.slice(end));
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + tag.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const handleGenerate = async (opts?: { rotateTemplate?: boolean }) => {
    setGenerating(true);
    try {
      const topic = body.trim()
        || customInstructions.trim()
        || (selectedListing?.property_title ? `פוסט קידום: ${selectedListing.property_title}` : `פוסט שיווקי מאת אודי ויטמן`);
      const rotateNote = opts?.rotateTemplate
        ? 'בחר תבנית שונה לחלוטין מהפעם הקודמת מתוך מאגר הידע (KB) של תבניות הפוסטים. גוון בין תבניות גלובליות לבין תבניות מקוריות של אודי. שמור על דיוק עובדתי מלא לפי נתוני הנכס, טון מקצועי בכיר וקריאה לפעולה חדה לוואטסאפ/טלפון. אל תחזור על אותו פתיח, אותה מבנה או אותו ניסוח CTA כמו בגרסה הקודמת.'
        : '';
      const mergedInstructions = [customInstructions.trim(), rotateNote].filter(Boolean).join('\n\n');
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic,
          platform: channel.id,
          customInstructions: mergedInstructions || undefined,
          selectedListingId: selectedListingId || undefined,
          listingFocusOnly: !!selectedListingId,
        },
      });
      if (error) throw error;
      const text = cleanBody(data?.content || data?.text || '').toString();
      if (text) {
        setBody(text);
        setBodyManuallyEdited(false);
        setOriginalAiBody(text);

        // so subsequent manual edits + media updates flow into the same record.
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: inserted } = await supabase.from('ai_content_logs').insert({
            topic: topic.slice(0, 500),
            generated_text: text,
            platform: channel.id,
            created_by: user?.id ?? null,
            media_urls: attachments.map((a) => ({ name: a.name, kind: a.kind, url: a.url || null })),
            listing_id: selectedListingId,
          }).select('id').single();
          if (inserted?.id) setLogId(inserted.id);
          setHistoryRefresh((n) => n + 1);
        } catch (logErr) {
          console.warn('[CampaignCenter] history log failed', logErr);
        }
      } else toast.info('לא התקבל טקסט');
      // Auto-generate a first comment in Udi's signature style.
      if (text) {
        void handleGenerateFirstComment(text);
      }
    } catch (e: any) {
      toast.error('יצירת טקסט נכשלה');
    } finally {
      setGenerating(false);
    }
  };

  // Generate a Hebrew "first comment" in Udi Wittman's warm, first-person tone.
  // Called automatically right after the main post is generated, and manually
  // via the refresh button on the first-comment textarea.
  const handleGenerateFirstComment = async (postBody?: string) => {
    setFirstCommentGenerating(true);
    try {
      const listing = selectedListing;
      const keywordLine = buildFirstCommentKeywordLine(listing as CampaignListing | null);
      const listingFacts = listing
        ? [
            listing.property_title ? `כותרת: ${listing.property_title}` : null,
            listing.address ? `כתובת: ${stripAddressNumbers(listing.address)}` : null,
            listing.neighborhood ? `שכונה: ${listing.neighborhood}` : null,
            listing.city ? `עיר: ${listing.city}` : null,
            listing.rooms ? `חדרים: ${listing.rooms}` : null,
            listing.sqm ? `שטח: ${listing.sqm} מ"ר` : null,
            listing.floor !== null && listing.floor !== undefined ? `קומה: ${listing.floor}` : null,
            listing.asking_price ? `מחיר: ${Number(listing.asking_price).toLocaleString('he-IL')} ש"ח` : null,
          ].filter(Boolean).join(' | ')
        : '';
      const styleInstructions = [
        'כתוב את התגובה הראשונה (First Comment) לפוסט נדל"ן — פורמט קצר וקפדני של שתי שורות בלבד.',
        'מבנה מחייב, בדיוק שתי שורות ותו לא:',
        'שורה 1: משפט אחד קצר, אנושי ומשכנע על הנכס (עד ~18 מילים). בלי אימוג\'ים, בלי בולטים, בלי סוגריים מרובעים.',
        `שורה 2: שורת מילות מפתח בדיוק זו, מופרדת בקווים אנכיים (|), ללא שינוי סדר או תוכן: ${keywordLine}`,
        listingFacts ? `פרטים יבשים של הנכס להישען עליהם בלבד (אסור להמציא נתונים שלא מופיעים כאן): ${listingFacts}` : '',
        'אסור בהחלט: יותר משתי שורות, פסקאות תיאור ארוכות, בולטים (✅/📍/💰/📞), אימוג\'ים בכלל, כוכביות, האשטגים, em-dash, מקפים כפולים (--), סוגריים מרובעים, או placeholders.',
        'אסור בתכלית האיסור: חתימה, שם המתווך, טלפון, רישיון תיווך, או פרטי יצירת קשר. התגובה חייבת להסתיים בשורת מילות המפתח.',
        postBody ? `לצורך הקשר בלבד, גוף הפוסט הראשי שכבר נוצר — אל תחזור עליו: """${postBody.slice(0, 600)}"""` : '',
      ].filter(Boolean).join('\n\n');
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic: 'תגובה ראשונה קצרה לפוסט נדל"ן — שתי שורות בלבד',
          platform: channel.id,
          customInstructions: styleInstructions,
          listingFocusOnly: false,
          skipLicenseFooter: true,
        },
      });
      if (error) throw error;
      let text = cleanFirstComment(String(data?.content || data?.text || ''));
      // Enforce strict 2-line layout: keep first non-empty line as the sentence,
      // then append the canonical keyword line as the second line.
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const firstSentence = lines.find((l) => !l.includes('|')) || lines[0] || '';
      const finalText = firstSentence && keywordLine
        ? `${firstSentence}\n${keywordLine}`
        : buildFallbackFirstComment(listing as CampaignListing | null);
      if (finalText) setFirstComment(finalText);
    } catch (e: any) {
      toast.error('יצירת תגובה ראשונה נכשלה');
    } finally {
      setFirstCommentGenerating(false);
    }
  };


  // Random CTA intro phrases used before the WA / Messenger shortlink so
  // every post reads a little differently.
  const WA_INTRO_PHRASES = [
    'דברו איתי בוואטסאפ',
    'שלחו לי הודעה',
    'אני כאן בשבילכם',
    'זמין לכל שאלה בוואטסאפ',
    'לחצו ודברו איתי ישירות',
    'מוזמנים לפנות אליי',
  ];
  const MSNGR_INTRO_PHRASES = [
    "דברו איתי במסנג'ר",
    "שלחו לי הודעה במסנג'ר",
    "אני כאן בשבילכם במסנג'ר",
    "זמין במסנג'ר לכל שאלה",
    "פנו אליי במסנג'ר",
  ];
  const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const injectFirstCommentLine = (line: string) => {
    setFirstComment((curr) => {
      const trimmed = (curr || '').replace(/\s+$/, '');
      return trimmed ? `${trimmed}\n\n${line}` : line;
    });
    requestAnimationFrame(() => {
      const el = firstCommentRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const removeFirstCommentLine = (line: string) => {
    if (!line) return;
    setFirstComment((curr) => (curr || '').replace(line, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, ''));
  };

  // When WA link is toggled ON, mint a branded shortlink and inject a CTA
  // line into the first-comment textarea with a random intro phrase.
  useEffect(() => {
    if (!attachWaLink) {
      if (waInjectedRef.current) {
        removeFirstCommentLine(waInjectedRef.current);
        waInjectedRef.current = '';
      }
      setWaShortUrl('');
      return;
    }
    let cancelled = false;
    (async () => {
      let url = 'https://wa.me/972522973500';
      try {
        if (selectedListingId) {
          const { data: slugRes } = await supabase.functions.invoke('shortlink-create', {
            body: { property_id: selectedListingId },
          });
          const slug = (slugRes as any)?.slug;
          if (slug) url = `https://realtyz.co.il/r/${slug}`;
        }
      } catch { /* keep fallback */ }
      if (cancelled) return;
      setWaShortUrl(url);
      const line = `${pickRandom(WA_INTRO_PHRASES)}: ${url}`;
      if (waInjectedRef.current) removeFirstCommentLine(waInjectedRef.current);
      waInjectedRef.current = line;
      injectFirstCommentLine(line);
    })();
    return () => { cancelled = true; };
  }, [attachWaLink, selectedListingId]);

  // Messenger deep-link uses the connected FB Page ref.
  useEffect(() => {
    if (!attachMsngrLink) {
      if (msngrInjectedRef.current) {
        removeFirstCommentLine(msngrInjectedRef.current);
        msngrInjectedRef.current = '';
      }
      setMsngrShortUrl('');
      return;
    }
    const pageRef = socialProfiles.find((p) => p.platform === 'facebook')?.accountRef;
    const url = pageRef ? `https://m.me/${pageRef}` : 'https://m.me/';
    setMsngrShortUrl(url);
    const line = `${pickRandom(MSNGR_INTRO_PHRASES)}: ${url}`;
    if (msngrInjectedRef.current) removeFirstCommentLine(msngrInjectedRef.current);
    msngrInjectedRef.current = line;
    injectFirstCommentLine(line);
  }, [attachMsngrLink, socialProfiles]);



  // Auto-trigger AI generation when entered via calendar scheduling flow
  // (presetListingId present + no existing body). Runs once after listings
  // load so the property context can be enriched into the AI payload.
  const autoGenTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoGenTriggeredRef.current) return;
    if (listingsLoading) return;
    if (body.trim().length > 0) return; // honor draft restoration
    // Fire auto-gen when the composer was launched from the scheduling
    // calendar. Two entry points:
    //  1. Multi-property fan-out — `presetListingId` prop is set per replica.
    //  2. Single-property (or branding) — the calendar deep-links via
    //     ?schedule=ISO plus optionally ?listing= / ?properties=. In that case
    //     the InlineComposer receives no props but must still auto-generate.
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const fromCalendar = !!presetScheduleIso || !!params?.get('schedule');
    const listingFromUrl = params?.get('listing') || (params?.get('properties') || '').split(',').map((s) => s.trim()).filter(Boolean)[0] || null;
    const listingForGen = presetListingId ?? listingFromUrl;
    if (!fromCalendar && !listingForGen) return;
    // Require a resolved listing so the property snapshot lands in the AI
    // payload. `selectedListingId` is hydrated from the URL in the mount
    // effect above — wait for it before firing.
    if (listingForGen && !selectedListingId) return;
    autoGenTriggeredRef.current = true;
    // Defer slightly so the variant-hint customInstructions effect (mount)
    // is committed before the AI call snapshots `customInstructions`.
    const t = setTimeout(() => { handleGenerate().catch(() => {}); }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetListingId, presetScheduleIso, selectedListingId, listingsLoading]);

  // True when this composer was launched from the scheduling calendar
  // (the date is already locked in); we hide the standalone calendar
  // toggle button in that case so the operator doesn't re-pick a date.
  const isFromScheduling = !!presetScheduleIso;

  const hasBody = body.trim().length > 0;
  const count = body.length;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 pb-16 shadow-sm space-y-4" dir="rtl">
      {/* Header row removed — title lives in the page hero; history is in the hero icon */}



      {/* Broker steering: custom instructions + property promotion picker */}

      <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/[0.03] p-3">
        <div className="pt-1">
          <Label className="font-semibold text-foreground" style={{ fontSize: 'calc(0.75rem + 3px)' }}>קדם נכס ספציפי מהמאגר</Label>
          <Popover open={listingPickerOpen} onOpenChange={setListingPickerOpen}>
            <PopoverTrigger asChild>
              <button type="button"
                className="mt-1 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-right hover:border-primary/40">
                <span className={cn('truncate', selectedListing ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {selectedListing
                    ? listingOptionLabel(selectedListing as CampaignListing)
                    : 'ללא קידום נכס ספציפי (פוסט כללי של אודי)'}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-2 max-h-80 overflow-auto" dir="rtl">
              <Input
                value={listingQuery}
                onChange={(e) => setListingQuery(e.target.value)}
                placeholder="חפש לפי כותרת, עיר או כתובת…"
                className="mb-2 text-right"
              />
              {selectedListingId && (
                <button type="button" onClick={() => {
                  setSelectedListingId(null);
                  setBody((current) => cleanBody(current.replace(/\n*[^\n]*realtyz\.co\.il\/r\/[a-z0-9]+[^\n]*/gi, '')));
                  setListingPickerOpen(false);
                }}
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
                  onClick={() => {
                    setSelectedListingId(l.id);
                    // Clear both composer areas so nothing bleeds from the
                    // previous property into the new one.
                    setBody('');
                    setFirstComment('');
                    setBodyManuallyEdited(false);
                    setOriginalAiBody('');
                    waInjectedRef.current = '';
                    msngrInjectedRef.current = '';
                    setAttachWaLink(false);
                    setAttachMsngrLink(false);
                    // Replace attachments with ONLY the selected property's
                    // photos — the previous property's images are dropped.
                     const photoUrls = extractListingPhotoUrls(l).slice(0, 10);
                     if (photoUrls.length > 0) {
                       setAttachments(photoUrls.map((u, i) => ({
                         name: `${l.property_title || l.address || 'property'}-${i + 1}.jpg`,
                         kind: 'image' as const,
                         url: u,
                       })));
                       toast.success(`נטענו ${photoUrls.length} תמונות של הנכס`);
                     } else {
                       setAttachments([]);
                       toast.info('לא נמצאו תמונות במאגר לנכס זה');
                     }

                    setListingPickerOpen(false);
                  }}

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

      {/* Generate-with-AI CTA sits ABOVE the post textarea and only shows
          while the textarea is empty. Once content exists, a compact regen
          button appears in the textarea's top-left corner instead. */}
      {!hasBody && (
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={generating}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-md transition',
            'bg-[#FFD600] text-[#E11D2A] hover:bg-[#FFC400] hover:shadow-lg',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          <Sparkles className={cn('h-4 w-4', generating && 'animate-spin')} />
          {generating ? 'מחולל תוכן…' : 'חולל תוכן עם AI'}
        </button>
      )}

      {/* Textarea: top-left regen button (only when body exists), bottom-left
          char counter, bottom-right attach popover (inside the field). */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          rows={6}
          value={body}
          onChange={(e) => {
            const raw = e.target.value.replace(/^[\s\u200f\u200e]+/g, '');
            setBody(cleanBody(raw));
            setBodyManuallyEdited(true);
          }}
          placeholder="תוכן הפוסט"
          className="resize-y text-right placeholder:text-muted-foreground/60 placeholder:font-medium pt-1.5 pb-10 pl-14"
        />
        {hasBody && (
          <button
            type="button"
            onClick={() => bodyManuallyEdited ? finalizeBody() : handleGenerate({ rotateTemplate: true })}
            disabled={generating || finalizingBody}
            className="absolute top-2 left-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label={bodyManuallyEdited ? 'שיוף לגרסה סופית' : 'חולל טקסט מחדש'}
            title={bodyManuallyEdited ? 'שיוף לגרסה סופית' : 'חולל טקסט מחדש'}
          >
            <RefreshCw className={cn('h-4 w-4', (generating || finalizingBody) && 'animate-spin')} />
          </button>
        )}
        {count > 0 && (
          <span className="pointer-events-none absolute left-2 bottom-2 text-[11px] tabular-nums text-muted-foreground/80" dir="ltr">
            {count}
          </span>
        )}
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5" dir="rtl">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
                aria-label="צירוף מדיה"
              >
                <Paperclip className="h-4 w-4" />
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
          {attachments.length > 0 && (
            <div className="relative flex items-center gap-1 flex-nowrap flex-1 min-w-0 overflow-x-auto">
              {attachments.map((att, i) => {
                const isVideo = !!att.url && (/\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(att.url) || /^video\//i.test((att as any).mimeType || ''));
                const isImage = att.kind === 'image' && !!att.url && !isVideo;
                return (
                  <div key={i} className="shrink-0">
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(att.url!)}
                        className="block h-[31px] w-[31px] overflow-hidden rounded-none border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
                        aria-label="פתח תמונה"
                      >
                        <img src={att.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : isVideo ? (
                      <video src={att.url} className="h-[31px] w-[31px] rounded-none object-cover bg-black" muted playsInline />
                    ) : (
                      <div className="flex h-[31px] w-[31px] items-center justify-center rounded-none border border-border bg-muted">
                        {att.kind === 'audio'
                          ? <Mic className="h-4 w-4 text-primary" />
                          : <Paperclip className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent" aria-hidden="true" />
            </div>
          )}
        </div>

      </div>

      {/* First-comment composer — always visible below the main textarea.
          When enabled (checkbox on), Ayrshare posts this text as the first
          comment on the published post. WA / Messenger link options live
          here and no longer touch the main post body. */}
      <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2" dir="rtl">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground select-none cursor-pointer">
            <Checkbox
              checked={firstCommentEnabled}
              onCheckedChange={(v) => setFirstCommentEnabled(v === true)}
              aria-label="פרסם תגובה ראשונה"
            />
            <span>פרסם תגובה ראשונה אוטומטית</span>
          </label>
          {firstComment.trim() && (
            <button
              type="button"
              onClick={() => handleGenerateFirstComment(body)}
              disabled={firstCommentGenerating || !firstCommentEnabled}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="חולל תגובה ראשונה מחדש"
              title="חולל תגובה ראשונה מחדש"
            >
              <RefreshCw className={cn('h-4 w-4', firstCommentGenerating && 'animate-spin')} />
            </button>
          )}
        </div>
        <Textarea
          ref={firstCommentRef as any}
          rows={5}
          value={firstComment}
          onChange={(e) => setFirstComment(e.target.value)}
          placeholder="תוכן התגובה"
          disabled={!firstCommentEnabled}
          className="resize-y text-right placeholder:text-muted-foreground/60"
        />
        {firstCommentEnabled && (
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-foreground select-none cursor-pointer">
              <Checkbox
                checked={attachWaLink}
                onCheckedChange={(v) => setAttachWaLink(v === true)}
                aria-label="הוסף קישור לוואטסאפ"
              />
              <span>הוסף קישור לוואטסאפ</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground select-none cursor-pointer">
              <Checkbox
                checked={attachMsngrLink}
                onCheckedChange={(v) => setAttachMsngrLink(v === true)}
                aria-label="הוסף קישור למסנג'ר"
              />
              <span>הוסף קישור למסנג'ר</span>
            </label>
          </div>
        )}
      </div>



      {/* Hidden inputs */}
      <input ref={galleryInputRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'image'); e.target.value = ''; }} />
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'image'); e.target.value = ''; }} />

      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'file'); e.target.value = ''; }} />

      {/* Attachments preview moved inline next to the Paperclip button above. */}


      {/* Publish button — sticky at the bottom of the viewport so it's
          always reachable no matter how long the composer scrolls. */}
      {(() => {
        const scheduledDate = scheduledLocal ? new Date(scheduledLocal) : null;
        const scheduledValid = mode === 'now' || (!!scheduledDate && scheduledDate.getTime() > Date.now());
        const hasSelectedPages = channel.id !== 'facebook' || platformProfiles.length === 0 || selectedProfileIds.length > 0;
        const canSend = hasBody && scheduledValid && hasSelectedPages;
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 px-4 sm:px-5 pb-0 pt-2 backdrop-blur">
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!canSend) return;
                  // WA / Messenger CTA lines are already embedded inside the
                  // first-comment textarea via the toggle effects, so we pass
                  // the textarea content through verbatim.
                  const composedFirstComment = firstCommentEnabled ? firstComment : '';
                  onConfirm({
                    body,
                    original_ai_body: originalAiBody,
                    listing_id: selectedListingId || null,
                    mode,
                    media_urls: attachments
                      .filter((a) => a.kind === 'image' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url))
                      .map((a) => a.url as string),
                    scheduled_at: mode === 'scheduled' && scheduledDate ? scheduledDate.toISOString() : null,
                    group_ids: channel.id === 'facebook' ? groupIds : [],
                    selected_profile_ids: channel.id === 'facebook' ? selectedProfileIds : [],
                    attach_wa_link: attachWaLink,
                    first_comment: composedFirstComment,
                    first_comment_enabled: firstCommentEnabled,
                    attach_msngr_link: attachMsngrLink,
                  });
                }}
                disabled={!canSend}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition',
                  canSend
                    ? 'bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)] shadow-md'
                    : 'bg-muted text-muted-foreground/80 cursor-not-allowed',
                )}
              >
                <Send className="h-4 w-4 -scale-x-100" />
                {mode === 'scheduled' ? 'תזמן פרסום' : 'פרסם עכשיו'}
              </button>
              <button
                type="button"
                onClick={() => setScheduleDialogOpen(true)}
                disabled={!hasBody}
                title="תזמן פרסום (כולל חזרות)"
                aria-label="תזמן פרסום כולל חזרות"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition border',
                  hasBody
                    ? 'bg-card text-[hsl(217,80%,18%)] border-[hsl(217,80%,18%)]/30 hover:bg-[hsl(217,80%,18%)]/5 shadow-sm'
                    : 'bg-muted text-muted-foreground/80 border-transparent cursor-not-allowed',
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                <span className="hidden sm:inline">תזמן</span>
              </button>
            </div>
          </div>

        );
      })()}




      {/* Lightbox for image attachments with prev/next navigation */}
      <Dialog open={!!previewImageUrl} onOpenChange={(o) => !o && setPreviewImageUrl(null)}>
        <DialogContent dir="rtl" className="max-w-3xl p-0 overflow-hidden bg-black">
          {(() => {
            const imageUrls = attachments
              .filter((a) => {
                const isVideo = !!a.url && (/\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(a.url));
                return a.kind === 'image' && !!a.url && !isVideo;
              })
              .map((a) => a.url as string);
            const idx = previewImageUrl ? imageUrls.indexOf(previewImageUrl) : -1;
            const hasPrev = idx > 0;
            const hasNext = idx >= 0 && idx < imageUrls.length - 1;
            return (
              <div className="relative">
                {previewImageUrl && (
                  <img src={previewImageUrl} alt="" className="max-h-[80vh] w-full object-contain bg-black" />
                )}
                {imageUrls.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => hasPrev && setPreviewImageUrl(imageUrls[idx - 1])}
                      disabled={!hasPrev}
                      className="absolute top-1/2 right-3 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30"
                      aria-label="הקודם"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => hasNext && setPreviewImageUrl(imageUrls[idx + 1])}
                      disabled={!hasNext}
                      className="absolute top-1/2 left-3 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30"
                      aria-label="הבא"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white tabular-nums" dir="ltr">
                      {idx + 1} / {imageUrls.length}
                    </div>
                  </>
                )}
                <div className="absolute bottom-3 left-3">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      const nextUrl = hasNext ? imageUrls[idx + 1] : (hasPrev ? imageUrls[idx - 1] : null);
                      setAttachments((a) => a.filter((att) => att.url !== previewImageUrl));
                      setPreviewImageUrl(nextUrl);
                    }}
                    aria-label="מחק מהפוסט"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>








      {/* Unified controlled-share cockpit for Facebook groups (merged selector + Time Bank queue) */}
      {hasBody && channel.id === 'facebook' && (
        <CustomGroupsQuickShare body={body} />
      )}


      {hasBody && channel.id === 'facebook' && platformProfiles.length > 1 && (
        <div className="rounded-xl border-2 border-primary bg-primary/5 p-3 space-y-2" dir="rtl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-foreground">בחירת עמודי Facebook לפרסום</span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground" dir="ltr">
              {selectedProfileIds.length}/{platformProfiles.length}
            </span>
          </div>
          <div className="divide-y divide-primary/15 overflow-hidden rounded-lg border border-primary/25 bg-background">
            {platformProfiles.map((profile) => {
              const checked = selectedProfileIds.includes(profile.id);
              return (
                <label key={profile.id} className={cn('flex cursor-pointer items-center justify-between gap-3 px-3 py-2 transition', checked ? 'bg-primary/10' : 'hover:bg-muted/40')}>
                  <div className="min-w-0 flex-1 text-right">
                    <div className="truncate text-sm font-bold text-foreground">{profile.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">{profile.profileKey || profile.accountRef}</div>
                  </div>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => setSelectedProfileIds((prev) => checked ? prev.filter((id) => id !== profile.id) : [...prev, profile.id])}
                    className="h-5 w-5 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  />
                </label>
              );
            })}
          </div>
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


      <ScheduleCurrentPostDialog
        open={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        onScheduled={() => {
          // Reset composer draft after successful schedule so the user can
          // start a fresh post — matches the post-publish behavior.
          try {
            const prefixes = [`rz-composer-draft:v2:${channel.id}`, `rz-composer-draft:${channel.id}`];
            for (const prefix of prefixes) {
              sessionStorage.removeItem(prefix);
              localStorage.removeItem(prefix);
            }
          } catch {}
          setBody('');
          setFirstComment('');
          setAttachments([]);
        }}
        channelId={channel.id}
        channelLabel={channel.label}
        brandName={brandName}
        body={body}
        firstComment={firstCommentEnabled ? firstComment : ''}
        mediaUrls={attachments
          .filter((a) => a.kind === 'image' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url))
          .map((a) => a.url as string)}
        listingId={selectedListingId || null}
        defaultGroupIds={channel.id === 'facebook' ? groupIds : []}
        targets={
          channel.id === 'facebook'
            ? platformProfiles
                .filter((p) => selectedProfileIds.includes(p.id))
                .map((p) => ({ id: p.id, name: p.name, accountRef: p.accountRef, profileKey: p.profileKey }))
            : []
        }
        isSocialChannel={['facebook','instagram','x','twitter','linkedin','youtube','tiktok'].includes(channel.id)}
      />
    </div>
  );
};

/* ───────────── Dispatch confirmation modal ───────────── */

const ConfirmDispatchDialog = ({
  open, onClose, channel, body, originalAiBody, listingId, brandName, mediaUrls, scheduledAt, groupIds, selectedProfileIds, attachWaLink, firstComment, onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelCard | null;
  body: string;
  originalAiBody: string;
  listingId: string | null;
  brandName: string;
  mediaUrls: string[];
  scheduledAt: string | null;
  groupIds: string[];
  selectedProfileIds: string[];
  attachWaLink: boolean;
  firstComment: string;
  onConfirmed: () => void;
}) => {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [pages, setPages] = useState<SocialAccountProfile[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);

  useEffect(() => {
    if (!open || !channel || !user) return;
    (async () => {
      setPagesLoading(true);
      try {
        let workspaceFacebookProfile: any = null;
        if (channel.id === 'facebook') {
          const { data: wsp } = await supabase
            .from('workspace_social_profile')
            .select('ayrshare_profile_key, facebook_page_id, facebook_page_name')
            .maybeSingle();
          workspaceFacebookProfile = wsp;
        }
        const workspaceProfileKey = String(workspaceFacebookProfile?.ayrshare_profile_key || '').trim();
        const workspaceFbId = String(workspaceFacebookProfile?.facebook_page_id || '').trim();
        const workspaceFbName = String(workspaceFacebookProfile?.facebook_page_name || '').trim();

        const { data } = await supabase
          .from('ayrshare_social_accounts')
          .select('id, platform, account_ref, profile_key, display_name, account_username, username, avatar_url, profile_url, is_active, connected')
          .eq('platform', channel.id)
          .eq('connected', true)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });
        let rows = (data || [])
          .map((r: any) => ({
            id: r.id,
            platform: r.platform,
            accountRef: r.account_ref || '',
            profileKey: channel.id === 'facebook' && workspaceProfileKey ? workspaceProfileKey : r.profile_key || null,
            name: workspaceFbName || r.display_name || r.account_username || r.username || channel.label,
            username: r.account_username || r.username || null,
            avatar: r.avatar_url || null,
            profileUrl: r.profile_url || (r.account_ref ? buildAccountUrl(channel.id, r.account_ref) : null),
          }));
        const seen = new Set<string>();
        rows = rows.filter((p) => {
          const key = `${p.platform}:${p.accountRef || p.profileKey || p.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (channel.id === 'facebook' && rows.length === 0) {
          if (workspaceFbId && workspaceProfileKey) {
            rows = [{
              id: `workspace-facebook:${workspaceFbId}`,
              platform: 'facebook',
              accountRef: workspaceFbId,
              profileKey: workspaceProfileKey,
              name: workspaceFbName || 'Facebook',
              username: null,
              avatar: null,
              profileUrl: buildAccountUrl('facebook', workspaceFbId),
            }];
          }
        }
        setPages(rows);
      } finally {
        setPagesLoading(false);
      }
    })();
  }, [open, channel, user]);

  if (!channel) return null;

  const selectedPages = pages.filter((p) => selectedProfileIds.includes(p.id));
  // Deduplicate by profile key / account ref / normalized name so the same
  // Facebook page never renders as two stacked cards for the מתעניין flow.
  const dedupePages = (rows: typeof pages) => {
    const seen = new Set<string>();
    const out: typeof pages = [];
    for (const p of rows) {
      const key = (p.profileKey || p.accountRef || (p.name || '').trim().toLowerCase()).toString();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  };
  const publishTargets = dedupePages(selectedPages.length > 0 ? selectedPages : pages.slice(0, 1));
  const selectedPage = publishTargets[0] || null;
  const profileLabel = selectedPage
    ? `${selectedPage.name}${selectedPage.username ? ` · @${selectedPage.username}` : ''}`
    : `${brandName} · @${brandName.replace(/\s+/g, '')}`;
  const initials = (selectedPage?.name || brandName).split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'R';
  const summaryTitle = body.trim().slice(0, 24) || channel.label;

  const SOCIAL_CHANNELS = new Set(['facebook', 'instagram', 'x', 'twitter', 'linkedin', 'youtube', 'tiktok']);

  const handleConfirm = async () => {
    console.log("EMERGENCY AUDIT: Broadcast button clicked successfully.");
    if (!user) { toast.error('יש להתחבר'); return; }
    if (isBroadcasting) return;
    const ownerScope = workspaceOwnerId ?? user.id;
    setIsBroadcasting(true);
    try {
      // WhatsApp CTA is OPT-IN via the "הוסף קישור לוואטסאפ" checkbox. When
      // checked, the composer has ALREADY inlined a rotating first-person opener
      // ("דברו איתי…") + a real WA link (branded shortlink or wa.me fallback)
      // into `body`, so we ship it as-is. When unchecked we transmit clean text.
      const bodyToPublish = body;
      const campaignName = `${brandName} · ${channel.label}`;

      if (SOCIAL_CHANNELS.has(channel.id)) {
        // mediaUrls was already filtered to public https links upstream by
        // InlineComposer; if it ends up empty here while the composer had any
        // image attachments, the edge function's guard will reject the post.
        if (!mediaUrls) {
          // defensive: should never happen since prop is typed string[]
        }
        // Fan-out one distinct publish payload per selected Facebook page/profile.
        const targets = channel.id === 'facebook' && publishTargets.length > 0 ? publishTargets : [null];
        const results = [] as any[];
        for (const target of targets) {
          // Optimistic pill in the sent-posts feed while Ayrshare verifies.
          if (!scheduledAt) {
            try {
              window.dispatchEvent(new CustomEvent('rz:campaign-optimistic', {
                detail: {
                  channel: channel.id,
                  body: bodyToPublish,
                  media_urls: mediaUrls,
                  campaign_name: target ? `${campaignName} · ${target.name}` : campaignName,
                },
              }));
            } catch { /* noop */ }
          }
          const { data, error } = await supabase.functions.invoke('ayrshare-post', {
            body: {
              post: bodyToPublish,
              channels: [channel.id],
              campaign_name: target ? `${campaignName} · ${target.name}` : campaignName,
              media_urls: mediaUrls,
              scheduled_at: scheduledAt,
              workspace_owner_id: ownerScope,
              group_ids: groupIds,
              target_profile_id: target?.id ?? null,
              target_account_ref: target?.accountRef ?? null,
              target_profile_key: target?.profileKey ?? null,
              first_comment: firstComment || null,
            },
          });
          results.push({ data, error, target });
        }


        // Circuit-breaker short-circuit: the backend is intentionally pausing
        // outbound Ayrshare traffic. Persist a "paused" campaign row so the
        // user sees the attempt in "קמפיינים שנשלחו" instead of it vanishing,
        // then close the dialog with a calm Hebrew notice.
        // Emergency override: publish path ignores the circuit-open response
        // from the backend so manual publishing stays unlocked during testing.
        const circuitTripped = false ? results.find((r) => (r.data as any)?.circuit_open === true) : null;
        if (circuitTripped) {
          onConfirmed();
          onClose();
          return;
        }

        const firstFailure = results.find((r) => r.error || (r.data as any)?.error || (r.data as any)?.success === false);
        const data = results[0]?.data;
        const error = firstFailure?.error;
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
              friendly = body?.message || body?.error || null;
            }
          } catch { /* ignore */ }
          if ((friendly || '').includes('חסומה זמנית') || (friendly || '').includes('עומס בקשות')) {
            toast.warning(friendly);
            return;
          }
          throw new Error(friendly || error.message || 'שגיאת רשת');
        }
        const failurePayload = firstFailure?.data as any;
        if (failurePayload?.error === 'rate_limit_exceeded' || failurePayload?.error === 'rate_limited' || failurePayload?.status === 429 || failurePayload?.code === 105) {
          toast.warning(failurePayload?.message || 'מערכת הפרסום חסומה זמנית. נסה שוב בעוד 5 דקות.');
          return;
        }
        if (failurePayload?.error || failurePayload?.success === false) {
          throw new Error(failurePayload?.message || failurePayload?.error || 'פרסום נכשל');
        }
        const unverified = results.find((r) => {
          const payload: any = r.data;
          if (scheduledAt) return false;
          return payload?.success === false || payload?.verified === false;
        });
        if (unverified) {
          const payload: any = unverified.data;
          throw new Error(payload?.message || payload?.error || 'פייסבוק לא אישר שהפוסט פורסם בפועל');
        }
        const groupFailures: any[] = results.flatMap((r) => Array.isArray((r.data as any)?.group_failures) ? (r.data as any).group_failures : []);
        if (scheduledAt) {
          const when = new Date(scheduledAt).toLocaleString('he-IL');
          toast.success(`הפוסט תוזמן ל-${when} ב-${targets.length} יעד(ים)`);
        } else if (groupIds.length > 0 && groupFailures.length === 0) {
          toast.success('הפוסט שותף בהצלחה בכל הקבוצות שנבחרו!');
        } else if (groupIds.length > 0 && groupFailures.length > 0) {
          toast.error(`פורסם אך נכשל ב-${groupFailures.length} קבוצות`);
        } else {
          toast.success(`הקמפיין פורסם בהצלחה ב-${targets.length} יעד(ים)!`);
        }
      } else {
        // Direct-messaging channels (SMS / email / IVR / AI Voice) broadcast to leads.
        const { data: leads, error } = await supabase
          .from('leads')
          .select('id, full_name, phone_number, email')
          .limit(100);
        if (error) throw error;

        const rows = (leads || []).map((l: any) => ({
          user_id: ownerScope,
          campaign_name: campaignName,
          channel: channel.id,
          lead_id: l.id,
          recipient_phone: l.phone_number,
          recipient_email: l.email,
          recipient_name: l.full_name,
          message_body: bodyToPublish,
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
                intro: bodyToPublish || 'מצורפים הפרטים העדכניים שביקשת.',
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
      // Active-learning capture for manual edits to the AI-drafted post body.
      learnFromEdit({
        context: `campaign_post:${channel.id}`,
        listing_id: listingId,
        pairs: [{ label: 'post_body', original: originalAiBody, edited: body }],
      });
      onConfirmed();
      onClose();
    } catch (e: any) {
      console.error("Broadcast failed:", e);
      toast.error('פרסום נכשל: ' + (e?.message ?? 'שגיאה לא ידועה'));
    } finally {
      setIsBroadcasting(false);
    }
  };




  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">אישור פרסום</DialogTitle>
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
              <div className="space-y-1">
                {publishTargets.map((p) => (
                  <div key={p.id} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-right">
                    <div className="truncate text-sm font-bold text-foreground">{p.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">{p.profileKey || p.accountRef}</div>
                  </div>
                ))}
              </div>
            )}
            {publishTargets.length === 0 && (
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
            )}
          </div>
        </div>


        <DialogFooter className="!justify-between gap-2 sm:gap-2 flex-row-reverse">
          <Button
            type="button"
            disabled={isBroadcasting}
            className="bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)]"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isBroadcasting) return;
              try {
                await handleConfirm();
              } catch (error) {
                console.error("Broadcast failed:", error);
              }
            }}


          >
            {isBroadcasting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                מפרסם ברשתות החברתיות...
              </span>
            ) : 'אישור ושידור'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isBroadcasting}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


/* ───────────── Tab 2: Published feed ───────────── */

type CampaignRow = {
  id: string;
  user_id?: string;
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
  status?: string | null;
  sent_at?: string | null;
  media_urls?: string[];
  external_url?: string | null;
  is_external?: boolean;
  listing_id?: string | null;
};

// A scheduled row is one whose status is "scheduled" AND whose execution time
// (sent_at) is still in the future. This is the single source of truth for the
// "מתוזמן" badge and the calendar view — never infer scheduling purely from
// the presence of sent_at, because real sent posts also stamp sent_at.
export const isScheduledRow = (r: Pick<CampaignRow, 'status' | 'sent_at'>): boolean => {
  const status = String(r.status || '').toLowerCase();
  if (status !== 'scheduled') return false;
  if (!r.sent_at) return false;
  return new Date(r.sent_at).getTime() > Date.now();
};

const extractFunctionError = async (error: any, fallback = 'שגיאת API חיצונית') => {
  const status = error?.context?.status ?? error?.status;
  let details: any = null;
  try {
    details = error?.context?.clone ? await error.context.clone().json() : null;
  } catch { /* ignore */ }
  const msg = details?.message || details?.error || details?.api_errors?.[0]?.payload?.message || details?.mapping_errors?.[0]?.error || error?.message || fallback;
  return `${status ? `HTTP ${status}: ` : ''}${msg}`;
};

const firstPipelineError = (data: any): string | null => {
  if (data?.error === 'MISSING_TENANT_KEY') return data?.message || 'נא לחבר מחדש את פרופיל המדיה החברתית בהגדרות המשרד';
  const api = Array.isArray(data?.api_errors) ? data.api_errors[0] : null;
  const mapping = Array.isArray(data?.mapping_errors) ? data.mapping_errors[0] : null;
  if (api) return `Provider ${api.status ?? ''}: ${api.payload?.message ?? api.error ?? 'API rejected request'}`;
  if (mapping) return mapping.error ?? 'Invalid external post id mapping';
  return null;
};

// Derive the live native post URL from Ayrshare provider response, or build
// a best-effort fallback URL from the platform + native post id.
const derivePostUrl = (r: CampaignRow): string | null => {
  if (r.external_url) return r.external_url;
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
  
];

const GlobalSocialFeed = ({
  rows, activeChannel, onChannelChange,
  connectedChannels, onConnectChannel,
}: {
  rows: CampaignRow[];
  activeChannel: string;
  onChannelChange: (id: string) => void;
  connectedChannels: Set<string>;
  onConnectChannel: (id: string) => void;
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
    const isConnected = connectedChannels.has(id) || id === 'whatsapp';
    const handleClick = () => {
      if (!isConnected) { onConnectChannel(id); return; }
      onChannelChange(id);
    };
    return (
      <button
        type="button"
        onClick={handleClick}
        title={isConnected ? label : `${label} — לחץ לחיבור`}
        aria-label={isConnected ? label : `חבר ${label}`}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-opacity',
          !isConnected && 'opacity-40 hover:opacity-70 grayscale',
          active && 'opacity-100',
        )}
      >
        {brand ? (
          <BrandIcon
            name={brand}
            aria-label={label}
            className={cn('h-5 w-5', isConnected ? (BRAND_COLOR[brand] ?? 'text-slate-600') : 'text-slate-500')}
          />
        ) : Icon ? (
          <Icon aria-label={label} className="h-5 w-5 text-slate-600" />
        ) : null}
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            active ? 'text-slate-900' : 'text-slate-500',
          )}
          dir="ltr"
        >
          {count}
        </span>
      </button>
    );
  };


  return (
    <div className="flex items-center gap-4 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1" dir="rtl">
      <button
        type="button"
        onClick={() => onChannelChange('all')}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-opacity',
          activeChannel === 'all' ? 'opacity-100' : 'opacity-70 hover:opacity-100',
        )}
      >
        <span className={cn('text-sm font-semibold', activeChannel === 'all' ? 'text-slate-900' : 'text-slate-600')}>הכל</span>
        <span className={cn(
          'text-sm font-bold tabular-nums',
          activeChannel === 'all' ? 'text-slate-900' : 'text-slate-500',
        )} dir="ltr">{counts.all}</span>
      </button>
      {FEED_PLATFORMS.map((p) => <Pill key={p.id} {...p} />)}
    </div>
  );
};


// Session-level cache so re-entering /campaigns doesn't refetch the persisted
// campaign_logs feed. Native Facebook posts are imported once into the database
// and then read only from campaign_logs, never kept as transient synthetic rows.
const FEED_ROWS_CACHE = new Map<string, CampaignRow[]>();
const FEED_LOAD_PROMISE_CACHE = new Map<string, Promise<{ rows: CampaignRow[]; ownerScope: string | null; importedCount: number; importComplete: boolean }>>();
const CAMPAIGNS_COUNT_SESSION_KEY = 'realtyz.campaigns.total_count';
const EXPECTED_NATIVE_FACEBOOK_POSTS = 150;
const FIRST_VISIT_IMPORT_KEY_VERSION = 'v6_recent_media_comment_refresh';
const CAMPAIGN_CACHE_MS = 5 * 60_000;

const PublishedFeed = () => {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<CampaignRow[] | null>(() => {
    // Optimistic hydration: on every mount, immediately seed from any prior
    // in-session cache so re-entering /campaigns never flashes the blocking
    // "טוען…" placeholder over posts we already loaded once this session.
    for (const cached of FEED_ROWS_CACHE.values()) {
      if (Array.isArray(cached) && cached.length > 0) return cached;
    }
    return null;
  });
  // True only during the very first cold load (no in-session cache anywhere).
  // The blocking loader is gated on this — a background refresh must never
  // hide already-rendered cached rows.
  const [coldLoading, setColdLoading] = useState<boolean>(() => {
    for (const cached of FEED_ROWS_CACHE.values()) {
      if (Array.isArray(cached) && cached.length > 0) return false;
    }
    return true;
  });

  const [userId, setUserId] = useState<string | null>(null);
  const [campaignUserIds, setCampaignUserIds] = useState<string[]>([]);
  const [editRepostRow, setEditRepostRow] = useState<CampaignRow | null>(null);
  // Optimistic rows for immediate publish — prepended to the feed with a
  // countdown pill while Ayrshare finishes verifying the FB publish.
  const [optimisticRows, setOptimisticRows] = useState<Array<CampaignRow & { _optimistic: true; _eta_ms: number; _scheduled_at?: string | null }>>([]);
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      const now = Date.now();
      const scheduledAt: string | null = typeof detail.scheduled_at === 'string' ? detail.scheduled_at : null;
      const scheduledMs = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
      const isScheduled = !!scheduledAt && Number.isFinite(scheduledMs) && scheduledMs > now;
      const row: CampaignRow & { _optimistic: true; _eta_ms: number; _scheduled_at?: string | null } = {
        id: `optimistic-${now}-${Math.random().toString(36).slice(2, 8)}`,
        campaign_name: String(detail.campaign_name || 'Campaign'),
        channel: String(detail.channel || 'facebook').toLowerCase(),
        message_body: String(detail.body || ''),
        created_at: new Date(now).toISOString(),
        provider_message_id: null,
        media_urls: Array.isArray(detail.media_urls) ? detail.media_urls : [],
        status: isScheduled ? 'scheduled' : 'publishing',
        sent_at: isScheduled ? scheduledAt : null,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        _optimistic: true,
        _eta_ms: isScheduled ? scheduledMs : now + 15_000,
        _scheduled_at: scheduledAt,
      };
      setOptimisticRows((prev) => [row, ...prev]);
      // Auto-cleanup: scheduled rows are matched by the real DB row via
      // realtime (see reconciliation below), so we only clear the temporary
      // "publishing" pill after 60s. Scheduled rows stay until reconciled.
      if (!isScheduled) {
        setTimeout(() => {
          setOptimisticRows((prev) => prev.filter((r) => r.id !== row.id));
        }, 60_000);
      }
    };
    window.addEventListener('rz:campaign-optimistic', handler as EventListener);
    return () => window.removeEventListener('rz:campaign-optimistic', handler as EventListener);
  }, []);
  // Force re-render each second so the countdown pill ticks. Runs whenever
  // there is an optimistic row OR any future scheduled row in the feed.
  const [, setTick] = useState(0);
  const hasFutureScheduled = useMemo(
    () => (rows || []).some((r) => isScheduledRow(r)),
    [rows],
  );
  useEffect(() => {
    if (optimisticRows.length === 0 && !hasFutureScheduled) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [optimisticRows.length, hasFutureScheduled]);
  // When a real row lands with matching body, drop the optimistic entry.
  useEffect(() => {
    if (!rows || optimisticRows.length === 0) return;
    setOptimisticRows((prev) => prev.filter((opt) => {
      const bodyKey = String(opt.message_body || '').trim().slice(0, 80);
      const match = rows.find((r) => String(r.message_body || '').trim().slice(0, 80) === bodyKey && String(r.channel).toLowerCase() === opt.channel);
      return !match;
    }));
  }, [rows]);

  // Circuit-breaker countdown: DISABLED via emergency override — publishing is
  // force-unlocked for development testing. The paused banner and cooldown
  // gate are bypassed regardless of any persisted `ayrshare_circuit_state`.
  const CIRCUIT_OVERRIDE = true;
  const [circuitUntilMs, setCircuitUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (CIRCUIT_OVERRIDE) {
      try {
        sessionStorage.removeItem('realtyz.ayrshare_circuit_state');
        localStorage.removeItem('realtyz.ayrshare_circuit_state');
      } catch { /* noop */ }
      setCircuitUntilMs(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase
          .from('campaign_settings')
          .select('value')
          .eq('key', 'ayrshare_circuit_state')
          .maybeSingle();
        if (cancelled) return;
        const parsed = data?.value ? JSON.parse(String(data.value)) : null;
        setCircuitUntilMs(parsed?.until_ms ?? null);
      } catch { /* ignore */ }
    };
    load();
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(tick); };
  }, []);

  const formatCountdown = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };



  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [liveCommentCounts, setLiveCommentCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = sessionStorage.getItem('realtyz.live_comment_counts');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const updateLiveCount = (campaignId: string, count: number) => {
    setLiveCommentCounts((prev) => {
      if (prev[campaignId] === count) return prev;
      const next = { ...prev, [campaignId]: count };
      try { sessionStorage.setItem('realtyz.live_comment_counts', JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };

  // Per-card refresh-signal counter. Bumping triggers a manual refresh inside
  // CampaignCommentsStream via its refreshSignal prop.
  const [refreshSignals, setRefreshSignals] = useState<Record<string, number>>({});
  const [refreshingIds, setRefreshingIds] = useState<Record<string, boolean>>({});
  // Per-campaign cooldown timestamp (ms epoch). Button is disabled with a
  // MM:SS countdown until now >= cooldownUntil.
  const REFRESH_COOLDOWN_MS = 15 * 60_000; // 15-minute provider lock
  const [cooldownUntil, setCooldownUntil] = useState<Record<string, number>>({});
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const hasActive = Object.values(cooldownUntil).some((t) => t > nowTick);
    if (!hasActive) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil, nowTick]);
  const getCooldownSeconds = (campaignId: string): number => {
    const until = cooldownUntil[campaignId] ?? 0;
    return Math.max(0, Math.ceil((until - nowTick) / 1000));
  };
  const formatCooldown = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const bumpRefresh = (campaignId: string) => {
    if (refreshingIds[campaignId]) return;
    if (getCooldownSeconds(campaignId) > 0) return;
    // Do NOT purge the cached comments/counters — persistent cache is the
    // whole point of "smart caching". Refresh only merges deltas on top.
    setRefreshingIds((prev) => ({ ...prev, [campaignId]: true }));
    toast.loading('מרענן תגובות חיות מפייסבוק…', { id: `refresh-${campaignId}` });
    setRefreshSignals((prev) => ({ ...prev, [campaignId]: (prev[campaignId] ?? 0) + 1 }));
    // Safety net: even if the child never calls onRefreshComplete, clear the
    // spinner after 45s so the button is never trapped in an infinite loop.
    setTimeout(() => {
      setRefreshingIds((prev) => {
        if (!prev[campaignId]) return prev;
        const n = { ...prev }; delete n[campaignId]; return n;
      });
      toast.dismiss(`refresh-${campaignId}`);
    }, 45_000);
  };

  const handleRefreshComplete = (campaignId: string, result: { ok: boolean; count: number; error?: string }) => {
    setRefreshingIds((prev) => { const n = { ...prev }; delete n[campaignId]; return n; });
    toast.dismiss(`refresh-${campaignId}`);
    if (result.ok) {
      setCooldownUntil((prev) => ({ ...prev, [campaignId]: Date.now() + REFRESH_COOLDOWN_MS }));
      setNowTick(Date.now());
      toast.success(`רוענן: ${result.count} תגובות חיות`, { id: `refresh-${campaignId}` });
    } else {
      toast.error(result.error || 'רענון נכשל', { id: `refresh-${campaignId}` });
    }
  };



  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [connectedChannels, setConnectedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('social_connections')
        .select('platform, is_connected')
        .eq('created_by', user.id);
      const next = new Set<string>();
      (data || []).forEach((r: any) => {
        if (!r?.is_connected) return;
        const p = String(r.platform || '').toLowerCase();
        if (p === 'twitter') next.add('x');
        else next.add(p);
      });
      setConnectedChannels(next);
    })();
  }, []);

  const handleFeedConnect = async (id: string) => {
    const platformMap: Record<string, string> = {
      facebook: 'facebook', instagram: 'instagram', x: 'twitter',
      youtube: 'youtube', linkedin: 'linkedin', tiktok: 'tiktok',
    };
    const platform = platformMap[id];
    if (!platform) { toast.error('הערוץ הזה לא נתמך כרגע דרך Ayrshare'); return; }
    try {
      toast.loading('פותח חיבור Ayrshare…', { id: 'ayr-connect-feed' });
      const { data, error } = await supabase.functions.invoke('ayrshare-social-link', { body: { platform } });
      toast.dismiss('ayr-connect-feed');
      if (error) throw new Error((error as any)?.message || 'יצירת חיבור נכשלה');
      const url = (data as any)?.url;
      if (!url) { toast.error((data as any)?.error || 'לא התקבל קישור חיבור מ-Ayrshare'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.dismiss('ayr-connect-feed');
      toast.error(e?.message ?? 'יצירת חיבור נכשלה');
    }
  };



  const load = async (opts: { forceFb?: boolean; skipFbImport?: boolean } = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); return { rows: [], ownerScope: null as string | null, importedCount: 0, importComplete: false }; }
    setUserId(user.id);
    // Scope by active workspace, not by the tenant's personal user id.
    const ownerScope = workspaceOwnerId ?? user.id;
    const scopedUserIds = await getCampaignWorkspaceUserIds(ownerScope, user.id);
    setCampaignUserIds(scopedUserIds);

    // DB-first: read the persisted campaign_logs feed BEFORE any Ayrshare
    // import. This is the whole point of the cache — the user should see
    // instantly whatever was previously stored, never waiting on the provider.
    const { data } = await supabase
      .from('campaign_logs')
      .select('id, user_id, campaign_name, channel, message_body, created_at, provider_message_id, provider_response, is_archived, like_count, comment_count, share_count, view_count, metrics_updated_at, status, sent_at')
      .in('user_id', scopedUserIds)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1000);

    const normalizeStoredRow = (r: any): CampaignRow => {
      const pr = r?.provider_response ?? {};
      const media = Array.isArray(pr?.media_urls)
        ? pr.media_urls
        : Array.isArray(pr?.media)
          ? pr.media
          : [];
      const externalUrl =
        (typeof pr?.external_url === 'string' && pr.external_url) ||
        (Array.isArray(pr?.postIds)
          ? pr.postIds.find((p: any) => String(p?.platform || '').toLowerCase() === String(r?.channel || '').toLowerCase())?.postUrl
          : null) ||
        null;
      return {
        ...r,
        media_urls: normalizePostMediaUrls(media),
        external_url: externalUrl,
        listing_id: (typeof pr?.listing_id === 'string' && pr.listing_id) || null,
      };
    };

    const grouped = new Map<string, CampaignRow>();
    (data || []).forEach((raw: any) => {
      const r = normalizeStoredRow(raw);
      // Use the FULL created_at timestamp (not minute-precision) so distinct
      // campaigns published in the same minute don't collapse into one row.
      const key = `${r.campaign_name}|${r.channel}|${r.created_at}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.recipient_count = (existing.recipient_count || 1) + 1;
        if (!existing.provider_message_id && r.provider_message_id) {
          existing.provider_message_id = r.provider_message_id;
        }
        existing.media_urls = existing.media_urls?.length ? existing.media_urls : r.media_urls;
        existing.external_url = existing.external_url || r.external_url || null;
        existing.like_count = Math.max(existing.like_count || 0, r.like_count || 0);
        existing.comment_count = Math.max(existing.comment_count || 0, r.comment_count || 0);
        existing.share_count = Math.max(existing.share_count || 0, r.share_count || 0);
        existing.view_count = Math.max(existing.view_count || 0, r.view_count || 0);
      } else {
        grouped.set(key, { ...r, recipient_count: 1 });
      }
    });
    const merged = Array.from(grouped.values()).sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    // Saved comment rows are the safest floor for default card counters.
    // Hydrate them before first render so collapsed cards never show 0/old
    // values while comments already exist in the database.
    const postIdsForCounts = Array.from(new Set(merged.map((r) => r.provider_message_id).filter((v): v is string => !!v)));
    if (postIdsForCounts.length > 0) {
      try {
        const { data: eventRows } = await supabase
          .from('engagement_events')
          .select('external_post_id, is_archived')
          .in('user_id', scopedUserIds)
          .in('external_post_id', postIdsForCounts);
        const savedCountByPostId = new Map<string, number>();
        for (const ev of eventRows ?? []) {
          if ((ev as any)?.is_archived === true) continue;
          const pid = String((ev as any)?.external_post_id || '');
          if (!pid) continue;
          savedCountByPostId.set(pid, (savedCountByPostId.get(pid) ?? 0) + 1);
        }
        for (const row of merged) {
          const saved = row.provider_message_id ? (savedCountByPostId.get(row.provider_message_id) ?? 0) : 0;
          if (saved > (Number(row.comment_count ?? 0) || 0)) row.comment_count = saved;
        }
      } catch (err) {
        console.warn('[PublishedFeed] saved comment count hydration failed', err);
      }
    }

    setRows(merged);
    FEED_ROWS_CACHE.set(ownerScope, merged);
    setColdLoading(false);
    try { sessionStorage.setItem(CAMPAIGNS_COUNT_SESSION_KEY, String(merged.length)); } catch { /* quota */ }
    // Nudge the sidebar to repaint the campaigns badge with the persisted DB count.
    try { queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] }); } catch { /* no-op */ }

    // Background Ayrshare import — never blocks the DB paint above. Only runs
    // when the caller explicitly forces it OR the persisted feed is thin
    // enough that we still need to backfill from the provider. The import
    // UPSERTS into campaign_logs; the realtime INSERT handler streams new
    // rows into the UI as they land.
    const importKey = `realtyz.fb_native_import.${FIRST_VISIT_IMPORT_KEY_VERSION}.${ownerScope}`;
    let shouldImport = opts.forceFb === true;
    if (!opts.skipFbImport) {
      const recentRowsNeedNativeRefresh = merged.slice(0, 20).some((r) =>
        String(r.channel || '').toLowerCase() === 'facebook' &&
        (!Array.isArray(r.media_urls) || r.media_urls.length === 0 || !r.external_url),
      );
      if (!shouldImport && merged.length < EXPECTED_NATIVE_FACEBOOK_POSTS) {
        try {
          const raw = sessionStorage.getItem(importKey);
          const importedAt = raw ? Number(raw) : 0;
          shouldImport = !Number.isFinite(importedAt) || Date.now() - importedAt > CAMPAIGN_CACHE_MS;
        } catch { shouldImport = true; }
      }
      if (!shouldImport && recentRowsNeedNativeRefresh) {
        try {
          const raw = sessionStorage.getItem(importKey);
          const importedAt = raw ? Number(raw) : 0;
          shouldImport = !Number.isFinite(importedAt) || Date.now() - importedAt > CAMPAIGN_CACHE_MS;
        } catch { shouldImport = true; }
      }
      if (shouldImport) {
        // Fire-and-forget — the DB is already painted; we never await this.
        void (async () => {
          try {
            const { data: importData, error: importError } = await supabase.functions.invoke('fb-recent-posts', {
              body: {
                lastRecords: 500,
                pageSize: 50,
                user_id: ownerScope,
                persist: true,
                sync_comments: true,
                force_provider_probe: true,
              },
            });
            const importedCount = Number((importData as any)?.count) || 0;
            if (importError) {
              console.warn('[PublishedFeed] fb persistent import failed (non-fatal)', importError);
            } else if ((importData as any)?.ok === false) {
              console.warn('[PublishedFeed] fb persistent import returned error', importData);
            } else if (importedCount >= EXPECTED_NATIVE_FACEBOOK_POSTS) {
              try { sessionStorage.setItem(importKey, String(Date.now())); } catch { /* quota */ }
            }
          } catch (err) {
            console.warn('[PublishedFeed] fb persistent import crashed (non-fatal)', err);
          }
        })();
      }
    }

    return { rows: merged, ownerScope, importedCount: shouldImport ? merged.length : 0, importComplete: merged.length >= EXPECTED_NATIVE_FACEBOOK_POSTS };
  };



  // Ask the backend to (a) refresh live Ayrshare analytics — likes/comments/shares/views
  // land back on campaign_logs and stream in via the realtime subscription below — and
  // (b) pull fresh inbound comments into engagement_events so the per-card comments tree
  // updates without a manual refresh.
  const refreshMetrics = async (ownerOverride?: string | null): Promise<boolean> => {
    const metricsOwner = ownerOverride ?? workspaceOwnerId ?? userId;
    if (!metricsOwner) return false;
    // Force a direct live page fetch every time — bypass any cached counters
    // so the UI mirrors the exact real-time Meta payload via Ayrshare.
    const cacheBust = `${Date.now()}-${crypto.randomUUID()}`;
    // Run the comments sync (nested replies + Like reactions) and the
    // headline analytics in parallel — neither blocks the other.
    const syncPromise = supabase.functions.invoke('ayrshare-sync-comments', {
      body: { force_live: true, cache_bust: cacheBust, user_id: metricsOwner },
    }).catch((err) => { console.warn('[refreshMetrics] sync-comments failed (non-fatal)', err); return null; });

    try {
      const [{ data, error }] = await Promise.all([
        supabase.functions.invoke('ayrshare-analytics', {
          body: { force_live: true, cache_bust: cacheBust, user_id: metricsOwner },
        }),
        syncPromise,
      ]);
      if (error) {
        const msg = await extractFunctionError(error, 'רענון מדדי פייסבוק נכשל');
        console.error('[refreshMetrics] analytics invoke error', { error, message: msg });
        toast.error(msg);
        return false;
      }
      const surfacedError = firstPipelineError(data);
      if (surfacedError) {
        console.warn('[refreshMetrics] analytics pipeline warning (non-fatal)', data);
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

      if (byId.size === 0 && commentCountByPostId.size === 0) return true;
      setRows((prev) => {
        const next = prev?.map((r) => {
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
          like_count: Math.max(Number(r.like_count ?? 0) || 0, Number(hit.counts.likes ?? 0) || 0),
          comment_count: Math.max(Number(r.comment_count ?? 0) || 0, hit.counts.comments, nestedComments),
          share_count: Math.max(Number(r.share_count ?? 0) || 0, Number(hit.counts.shares ?? 0) || 0),
          view_count: Math.max(Number(r.view_count ?? 0) || 0, Number(hit.counts.views ?? 0) || 0),
          metrics_updated_at: hit.metrics_updated_at ?? new Date().toISOString(),
        };
        }) ?? prev;
        if (next) FEED_ROWS_CACHE.set(metricsOwner, next);
        return next;
      });
      return true;
    } catch (err) {
      console.warn('[refreshMetrics] analytics crashed (non-fatal)', err);
      return false;
    }
  };


  useEffect(() => {
    // Session cache: on the first /campaigns visit per workspace per browser
    // session, load the unified feed (DB campaign_logs + native FB) once.
    // Subsequent navigations into /campaigns reuse the in-memory cache and
    // skip both the DB query and the fb-recent-posts call entirely. New
    // local campaign inserts append via the realtime INSERT handler below.
    const wsKey = workspaceOwnerId ?? 'anon';
    const cached = FEED_ROWS_CACHE.get(wsKey);
    let cancelled = false;
    const hydrateAndRefresh = async () => {
      // 1) INSTANT paint from in-memory cache (same-session re-entry).
      if (cached && cached.length > 0) {
        setRows(cached);
        setColdLoading(false);
      }

      // 2) Always run a DB-only read so cross-session re-entries paint
      //    instantly from campaign_logs without waiting on Ayrshare. The
      //    fb-recent-posts import is fired inside load() as a background
      //    task — it never blocks the DB paint.
      let pending = FEED_LOAD_PROMISE_CACHE.get(wsKey);
      if (!pending) {
        pending = load({ forceFb: false }).finally(() => FEED_LOAD_PROMISE_CACHE.delete(wsKey));
        FEED_LOAD_PROMISE_CACHE.set(wsKey, pending);
      }
      try {
        const result = await pending;
        const ownerForMetrics = result?.ownerScope ?? workspaceOwnerId ?? userId;
        if (ownerForMetrics && !cancelled) {
          try {
            const metricsKey = `realtyz.fb_live_metrics.${FIRST_VISIT_IMPORT_KEY_VERSION}.${ownerForMetrics}`;
            const last = Number(sessionStorage.getItem(metricsKey) || 0);
            if (!Number.isFinite(last) || Date.now() - last > CAMPAIGN_CACHE_MS) {
              sessionStorage.setItem(metricsKey, String(Date.now()));
              void refreshMetrics(ownerForMetrics);
            }
          } catch {
            void refreshMetrics(ownerForMetrics);
          }
        }
      } finally {
        if (!cancelled) setColdLoading(false);
      }
    };
    void hydrateAndRefresh();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceOwnerId]);






  // Realtime: live-patch counters into rows as soon as the edge function
  // updates campaign_logs — no manual refresh needed.
  useEffect(() => {
    const scope = workspaceOwnerId ?? userId;
    if (!scope || campaignUserIds.length === 0) return;
    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) {
        try { (supabase as any).realtime.setAuth(token); } catch { /* noop */ }
      }
    });
    const channel = supabase
      .channel(`campaign_logs:${scope}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaign_logs' },
        (payload) => {
          const updated: any = payload.new;
          if (!campaignUserIds.includes(updated?.user_id)) return;
          setRows((prev) => prev?.map((r) => {
            if (r.id !== updated.id && !campaignMatchesExternalPost(r, updated.provider_message_id)) return r;
            // Protect-from-zero: a transient 0 from the provider must never
            // mask a previously stored >0 counter. Always keep the max of
            // (incoming, existing) for the 3 root engagement fields.
            const keepMax = (incoming: unknown, existing: unknown) => {
              const a = typeof incoming === 'number' ? incoming : 0;
              const b = typeof existing === 'number' ? existing : 0;
              return Math.max(a, b);
            };
            return {
              ...r,
              provider_message_id: r.provider_message_id || updated.provider_message_id,
              media_urls: normalizePostMediaUrls(updated.provider_response?.media_urls ?? updated.provider_response?.media ?? r.media_urls ?? []),
              external_url: updated.provider_response?.external_url || r.external_url || null,
              like_count: keepMax(updated.like_count, r.like_count),
              comment_count: keepMax(updated.comment_count, r.comment_count),
              share_count: keepMax(updated.share_count, r.share_count),
              view_count: keepMax(updated.view_count, r.view_count),
              metrics_updated_at: updated.metrics_updated_at ?? r.metrics_updated_at,
            };
          }) ?? prev);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_logs' },
        (payload) => {
          const inserted: any = payload.new;
          if (campaignUserIds.includes(inserted?.user_id)) {
            setRows((prev) => {
              if (!prev) return prev;
              if (prev.some((row) => row.id === inserted.id)) return prev;
              const provider = inserted.provider_response ?? {};
              const normalized = {
                ...inserted,
                media_urls: normalizePostMediaUrls(provider.media_urls ?? provider.media ?? []),
                external_url: provider.external_url || (Array.isArray(provider.postIds) ? provider.postIds[0]?.postUrl : null) || null,
              } as CampaignRow;
              const next = [normalized, ...prev];
              FEED_ROWS_CACHE.set(workspaceOwnerId ?? inserted.user_id, next);
              return next;
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engagement_events' },
        async (payload) => {
          const changed: any = payload.new || payload.old;
          if (!campaignUserIds.includes(changed?.user_id)) return;
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
            .in('user_id', campaignUserIds)
            .eq('external_post_id', externalPostId);
          if (typeof count === 'number') {
            setRows((prev) => prev?.map((r) => (
              campaignMatchesExternalPost(r, externalPostId)
                ? { ...r, comment_count: Math.max(Number(r.comment_count ?? 0) || 0, count), metrics_updated_at: r.metrics_updated_at ?? new Date().toISOString() }
                : r
            )) ?? prev);
          }
        },
      )

      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, workspaceOwnerId, campaignUserIds.join('|')]);

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
    setRows((prev) => {
      const next = prev?.filter((x) => x.id !== r.id) ?? prev;
      const scopeKey = workspaceOwnerId ?? userId ?? '';
      if (next && scopeKey) FEED_ROWS_CACHE.set(scopeKey, next);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
    toast.success('הקמפיין הועבר לארכיון');
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
    setRows((prev) => {
      const next = prev?.filter((x) => x.id !== r.id) ?? prev;
      const scopeKey = workspaceOwnerId ?? userId ?? '';
      if (next && scopeKey) FEED_ROWS_CACHE.set(scopeKey, next);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
    toast.success(
      externalIds.length > 0
        ? `הפוסט נמחק בהצלחה מפייסבוק ומהמערכת${typeof count === 'number' ? ` (${count} רשומות)` : ''}`
        : `הפוסט נמחק מהמערכת${typeof count === 'number' ? ` (${count} רשומות)` : ''}`,
    );
  };

  // Remove a single image from a post card. Local-only (the card's media list
  // is rebuilt from Ayrshare on each load, so this hides it for the session).
  const removeMediaAt = (campaignId: string, index: number) => {
    setRows((prev) => prev?.map((row) => {
      if (row.id !== campaignId) return row;
      const next = Array.isArray(row.media_urls) ? [...row.media_urls] : [];
      next.splice(index, 1);
      return { ...row, media_urls: next };
    }) ?? prev);
  };


  // Backfill missing post images (og:image) via Firecrawl once per post_url.
  // Persists into campaign_logs.provider_response.media_urls so subsequent
  // page loads render instantly from the DB — never re-scraping.
  useEffect(() => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const targets = rows.filter((r) =>
      (!Array.isArray(r.media_urls) || r.media_urls.length === 0) &&
      typeof (r as any).external_url === 'string' &&
      (r as any).external_url,
    );
    if (targets.length === 0) return;

    // Force re-scrape for a specific post URL that was previously stuck without media.
    const FORCE_RESCRAPE_URLS = new Set<string>([
      'https://www.facebook.com/share/p/18vJVtCQEQ/',
    ]);

    let cancelled = false;
    (async () => {
      for (const r of targets) {
        if (cancelled) return;
        const postUrl = (r as any).external_url as string;
        const sentinel = `realtyz_og_image_${btoa(unescape(encodeURIComponent(postUrl))).slice(0, 40)}`;
        const forced = FORCE_RESCRAPE_URLS.has(postUrl);
        try {
          if (forced) {
            localStorage.removeItem(sentinel);
          } else if (localStorage.getItem(sentinel)) {
            continue;
          }
          localStorage.setItem(sentinel, String(Date.now()));
        } catch { /* quota */ }
        try {
          const { data } = await supabase.functions.invoke('resolve-post-og-image', {
            body: { campaign_log_id: r.id, post_url: postUrl, force: forced },
          });
          const media = (data as any)?.media_urls;
          if (Array.isArray(media) && media.length > 0) {
            setRows((prev) => prev?.map((row) => row.id === r.id
              ? { ...row, media_urls: media }
              : row,
            ) ?? prev);
          }
        } catch (err) {
          console.warn('[og-image] resolve failed', err);
        }
        // Gentle spacing between scrapes to keep Firecrawl usage low.
        await new Promise((res) => setTimeout(res, 800));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows?.length]);





  const filteredRows = useMemo(() => {
    const base = rows ?? [];
    const merged: CampaignRow[] = [...optimisticRows, ...base];
    if (activeChannel === 'all') return merged;
    return merged.filter((r) => String(r.channel || '').toLowerCase() === activeChannel);
  }, [rows, activeChannel, optimisticRows]);

  // Blocking loader ONLY on a true cold start: no cached rows in memory AND
  // the initial background load is still in-flight. As soon as we have any
  // rows (cached or freshly-loaded, even zero-length after settle), we render
  // the feed shell instead of hiding it behind "טוען…".
  if (rows === null && coldLoading) {
    return <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">טוען…</div>;
  }

  

  return (
    <div className="space-y-3">
      <GlobalSocialFeed
        rows={rows ?? []}
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        connectedChannels={connectedChannels}
        onConnectChannel={handleFeedConnect}
      />

      {filteredRows && filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">אין קמפיינים בערוץ זה</p>
          <p className="mt-1 text-xs text-muted-foreground">לאחר שתפעיל קמפיין מהטאב "צור קמפיין", הוא יופיע כאן עם מעקב לייקים, שיתופים ותגובות.</p>
        </div>
      ) : (filteredRows || []).map((r) => {


        const isOpen = expanded[r.id] ?? false;
        const scheduled = isScheduledRow(r);
        // Emergency override: never treat rows as paused in the UI so the
        // protection banner and yellow/red countdown are fully bypassed.
        const isPaused = false;

        const dt = scheduled && r.sent_at ? new Date(r.sent_at) : new Date(r.created_at);

        const dateStr = dt.toLocaleDateString('he-IL') + ', ' + dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        const platformMeta = FEED_PLATFORMS.find((p) => p.id === String(r.channel || '').toLowerCase());
        const postUrl = derivePostUrl(r);
        const bodyText = r.message_body || '';
        const isHe = /[\u0590-\u05FF]/.test(bodyText);
        const dirAttr: 'rtl' | 'ltr' = isHe ? 'rtl' : 'ltr';
        const alignClass = isHe ? 'text-right' : 'text-left';
        const preview = bodyText.trim().slice(0, 100) + (bodyText.trim().length > 100 ? '…' : '');
        const fmt = (v: number | null | undefined) => (typeof v === 'number' ? v : 0);
        const liveCount = liveCommentCounts[r.id];
        // Once the comment tree has been loaded (even once), it is the
        // authoritative count — top-level + follow-up replies. Never mix in
        // the inflated Ayrshare aggregate (dbComments); it double-counts.
        const dbComments = Math.max(0, typeof r.comment_count === 'number' ? r.comment_count : 0);
        const commentDisplay = typeof liveCount === 'number'
          ? liveCount
          : fmt(r.comment_count);

        return (
          <article
            key={r.id}
            className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden"
            dir={dirAttr}
          >
            <header
              className="p-4 space-y-2 cursor-pointer"
              onClick={() => setExpanded((s) => ({ ...s, [r.id]: !isOpen }))}
            >

              {/* Row 1: thumbnail + post title */}
              <div className={cn('flex items-center gap-3', isHe ? 'flex-row' : 'flex-row-reverse')}>
                {r.media_urls?.[0] ? (
                  <img
                    src={r.media_urls[0]}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover border border-border"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg border border-border bg-muted flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <h3 className={cn('flex-1 font-semibold text-foreground line-clamp-2', alignClass)} dir={dirAttr}>
                  {(bodyText.trim().split('\n')[0] || r.campaign_name)}
                </h3>
              </div>


              {/* Row 2 (single combined row): logo · date  ........  comments · shares · likes · chevron */}
              <div className={cn('flex items-center gap-2', isHe ? 'flex-row' : 'flex-row-reverse')}>
                <span className="inline-flex items-center justify-center shrink-0">
                  {platformMeta?.brand ? (
                    <BrandIcon name={platformMeta.brand} className={cn('h-5 w-5', BRAND_COLOR[platformMeta.brand] ?? 'text-muted-foreground')} />
                  ) : platformMeta?.icon ? (
                    <platformMeta.icon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <span className="text-[10px] font-bold uppercase">{r.channel?.slice(0, 2)}</span>
                  )}
                </span>
                <span className={cn(
                  'text-xs whitespace-nowrap',
                  scheduled ? 'text-amber-700 font-semibold' : 'text-muted-foreground',
                )}>
                  {scheduled ? `מתוזמן ל-${dateStr}` : dateStr}
                </span>
                <span className="flex-1" />
                {(r as any)._optimistic && !scheduled ? (() => {
                  const remaining = Math.max(0, Math.ceil((((r as any)._eta_ms as number) - Date.now()) / 1000));
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800 ring-1 ring-blue-200">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {remaining > 0 ? `מפרסם בפייסבוק · ${remaining}ש׳` : 'ממתין לאישור פייסבוק…'}
                    </span>
                  );
                })() : isPaused ? null : scheduled ? (() => {
                  const target = r.sent_at ? new Date(r.sent_at).getTime() : NaN;
                  const diff = Number.isFinite(target) ? target - Date.now() : NaN;
                  let label = 'מתוזמן';
                  if (Number.isFinite(diff)) {
                    if (diff <= 0) {
                      label = 'מפרסם עכשיו…';
                    } else {
                      const s = Math.floor(diff / 1000);
                      const d = Math.floor(s / 86400);
                      const h = Math.floor((s % 86400) / 3600);
                      const m = Math.floor((s % 3600) / 60);
                      const sec = s % 60;
                      const parts = d > 0
                        ? [`${d}י׳`, `${h}ש׳`, `${m}ד׳`]
                        : h > 0
                          ? [`${h}ש׳`, `${m}ד׳`, `${sec}שנ׳`]
                          : [`${m}ד׳`, `${sec}שנ׳`];
                      label = `פרסום בעוד ${parts.join(' ')}`;
                    }
                  }
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 tabular-nums">
                      <CalendarIcon className="h-3 w-3" />
                      {label}
                    </span>
                  );
                })() : (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="תגובות">
                      <MessageSquare className="h-3.5 w-3.5 text-[hsl(220_70%_25%)]" />
                      <span className="tabular-nums">{commentDisplay}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="שיתופים">
                      <Share2 className="h-3.5 w-3.5 text-[hsl(220_70%_25%)]" />
                      <span className="tabular-nums">{r.share_count ?? 0}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="לייקים">
                      <Heart className="h-3.5 w-3.5 text-[hsl(220_70%_25%)]" />
                      <span className="tabular-nums">{r.like_count ?? 0}</span>
                    </span>
                  </>
                )}
                <button onClick={(e) => { e.stopPropagation(); setExpanded((s) => ({ ...s, [r.id]: !isOpen })); }}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted shrink-0"
                        aria-label={isOpen ? 'כווץ' : 'הרחב'}>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
              {isPaused && (() => {
                const remainingMs = circuitUntilMs ? circuitUntilMs - nowMs : 0;
                const hasCountdown = remainingMs > 0;
                const isUrgent = remainingMs > 5 * 60_000;
                const tone = isUrgent
                  ? { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-600 text-yellow-300' }
                  : { border: 'border-orange-300', bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-yellow-300 text-red-700' };
                return (
                  <div className={`rounded-md border ${tone.border} ${tone.bg} px-2.5 py-2`}>
                    <div className={`flex items-center gap-1.5 text-[11px] font-bold ${tone.text}`}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>הפרסום הושהה זמנית - המערכת במצב הגנה</span>
                      {hasCountdown && (
                        <span className={`ms-auto tabular-nums rounded ${tone.badge} px-1.5 py-0.5 text-[10px]`}>
                          {formatCountdown(remainingMs)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}


            </header>



            {isOpen && (
              <>
                {r.media_urls && r.media_urls.length > 0 && (
                  <div className="mx-4 mb-3 flex gap-2 overflow-x-auto">
                    {r.media_urls.slice(0, 6).map((src, i) => (
                      <div key={i} className="relative shrink-0 group">
                        <img src={src} alt="" loading="lazy"
                             className="h-32 w-32 rounded-lg object-cover border border-border" />
                        <button
                          type="button"
                          title="הסר תמונה"
                          aria-label="הסר תמונה"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('להסיר את התמונה מהפוסט?')) removeMediaAt(r.id, i);
                          }}
                          className="absolute top-1 left-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />

                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={cn('mx-4 mb-3 rounded-xl border border-border bg-background p-4 text-sm text-foreground whitespace-pre-wrap', alignClass)} dir={dirAttr}>
                  {bodyText || <span className="text-muted-foreground">אין תוכן הודעה</span>}
                </div>
                <div className="flex items-center justify-between gap-2 px-4 pb-4" dir="rtl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" title="פתח פוסט" aria-label="פתח פוסט"
                            disabled={!postUrl}
                            onClick={(e) => { e.stopPropagation(); if (postUrl) window.open(postUrl, '_blank', 'noopener,noreferrer'); }}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    {(() => {
                      const isRefreshing = !!refreshingIds[r.id];
                      const cooldownSecs = getCooldownSeconds(r.id);
                      const onCooldown = !isRefreshing && cooldownSecs > 0;
                      const label = isRefreshing
                        ? 'מרענן…'
                        : onCooldown
                          ? `ממתין: ${formatCooldown(cooldownSecs)}`
                          : 'רענן תגובות';
                      return (
                        <Button
                          variant="outline"
                          size={onCooldown ? 'sm' : 'icon'}
                          title={label}
                          aria-label={label}
                          disabled={isRefreshing || onCooldown}
                          onClick={(e) => { e.stopPropagation(); bumpRefresh(r.id); }}
                          className={cn(onCooldown && 'opacity-50 cursor-not-allowed gap-1 tabular-nums text-xs')}
                        >
                          {onCooldown ? (
                            <span className="tabular-nums text-xs font-medium">{formatCooldown(cooldownSecs)}</span>
                          ) : (
                            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                          )}
                        </Button>

                      );
                    })()}
                    <Button variant="outline" size="icon" disabled className="opacity-90"
                            title={`מדיה מצורפת: ${Array.isArray(r.media_urls) ? r.media_urls.length : 0}`}
                            aria-label="מדיה מצורפת">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" title="ערוך ופרסם מחדש" aria-label="ערוך ופרסם מחדש"
                            onClick={(e) => { e.stopPropagation(); setEditRepostRow(r); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" title="מחק פוסט" aria-label="מחק פוסט"
                            onClick={(e) => { e.stopPropagation(); deleteCampaign(r); }}
                            className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!r.is_external && (
                  <CampaignGroupBreakdown
                    workspaceOwnerId={workspaceOwnerId}
                    campaignBody={bodyText}
                    campaignCreatedAt={r.created_at}
                  />
                )}
                <div className="border-t border-border bg-muted/30 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <CampaignCommentsStream
                    userId={userId ?? ''}
                    campaign={r}
                    commentCount={typeof liveCount === 'number' ? liveCount : dbComments}
                    onLiveCountResolved={updateLiveCount}
                    refreshSignal={refreshSignals[r.id] ?? 0}
                    onCountersResolved={(campaignId, counters) => {
                      const pickNum = (v: unknown) => (typeof v === 'number' ? v : 0);
                      const max = (a: unknown, b: unknown) => Math.max(pickNum(a), pickNum(b));
                      setRows((prev) => prev?.map((row) => row.id === campaignId ? {
                        ...row,
                        like_count: max(counters.like_count, row.like_count),
                        share_count: max(counters.share_count, row.share_count),
                        comment_count: max(counters.comment_count, row.comment_count),
                        metrics_updated_at: new Date().toISOString(),
                      } : row) ?? prev);
                    }}
                    onRefreshComplete={handleRefreshComplete}
                  />
                </div>

              </>
            )}
          </article>
        );
      })}
      {editRepostRow && (
        <EditRepostDialog
          open={!!editRepostRow}
          onOpenChange={(v) => { if (!v) setEditRepostRow(null); }}
          campaign={{
            id: editRepostRow.id,
            channel: editRepostRow.channel,
            message_body: editRepostRow.message_body,
            media_urls: editRepostRow.media_urls,
            campaign_name: editRepostRow.campaign_name,
            listing_id: editRepostRow.listing_id ?? null,
          }}
          onPosted={() => {
            queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          }}
        />
      )}
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

type VoiceLead = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  role: string | null; // מוכר / קונה / שוכר / משכיר
  budget: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  seller: 'מוכר',
  buyer: 'קונה',
  renter: 'שוכר',
  landlord: 'משכיר',
};

const cleanName = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const parts = raw.split(/[\/|]/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((p) => { if (seen.has(p)) return false; seen.add(p); return true; });
  return unique.join(' ').replace(/\s+/g, ' ').trim();
};

const formatBudget = (raw: any): string | null => {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `₪${n.toLocaleString('he-IL')}`;
  return `₪${n}`;
};

const mapVoiceLead = (r: any): VoiceLead => {
  const prefs = r.preferences ?? {};
  const extra = prefs.extra_fields ?? {};
  const cleaned = cleanName(r.full_name);
  const prefName = cleanName(extra['שם מלא']);
  return {
    id: r.id,
    full_name: prefName || cleaned || null,
    phone: r.phone_number ?? r.phone ?? null,
    city: r.city || extra['עיר'] || null,
    role: ROLE_LABEL[prefs.lead_kind] || (r.deal_type === 'rent' ? 'שוכר' : r.deal_type === 'sale' ? 'קונה' : null),
    budget: formatBudget(extra['מחיר']) || formatBudget(prefs.budget_max) || formatBudget(prefs.budget),
  };
};

type Gender = 'male' | 'female';

const PRESET_VOICE_AGENTS: { id: string; label: string; voice_id: string; gender: Gender }[] = [
  { id: 'sarah',    label: 'שרה (אישה)',     voice_id: 'EXAVITQu4vr4xnSDxMaL', gender: 'female' },
  { id: 'matilda',  label: 'מטילדה (אישה)', voice_id: 'XrExE9yKIg1WjnnlVkGX', gender: 'female' },
  { id: 'charlie',  label: 'צ׳רלי (גבר)',    voice_id: 'IKne3meq5aSn9XLyUdCD', gender: 'male' },
];

type ClonedVoice = { id: string; name: string; voice_id: string; preview_url?: string | null; voice_gender?: Gender | null };

// Hebrew gender helpers — render verbs/adjectives in the correct grammatical
// gender of the addressee (the broker). Defaults to neutral male-form when
// gender is unknown so we never silently address a male user as female.
const heVerb = (g: Gender | null | undefined, male: string, female: string) =>
  g === 'female' ? female : male;


const VoiceLeadPickerDialog = ({
  open, onClose, channel,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelCard | null;
}) => {
  const [leads, setLeads] = useState<VoiceLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [listGroup, setListGroup] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');
  const [instructions, setInstructions] = useState('');
  const [dialing, setDialing] = useState(false);

  // Broker (caller) gender — used to address the user in correct Hebrew grammar.
  const [userGender, setUserGender] = useState<Gender | null>(null);

  // Property promotion picker — optional focus listing for the call.
  const [voiceListings, setVoiceListings] = useState<{ id: string; title: string; city: string | null; asking_price: number | null }[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  // Manual-select state
  const [search, setSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Cloned voices + sub-dialogs
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [voiceIdOpen, setVoiceIdOpen] = useState(false);

  const allAgents = useMemo(
    () => [
      ...PRESET_VOICE_AGENTS,
      ...clonedVoices.map((v) => ({
        id: `cv:${v.id}`,
        label: `${v.name} (קול מותאם${v.voice_gender === 'female' ? ' · אישה' : v.voice_gender === 'male' ? ' · גבר' : ''})`,
        voice_id: v.voice_id,
        gender: (v.voice_gender ?? null) as Gender | null,
      })),
    ],
    [clonedVoices],
  );
  const selectedAgent = allAgents.find((a) => a.id === agentId) ?? null;
  const selectedListing = voiceListings.find((l) => l.id === selectedListingId) ?? null;

  const loadClonedVoices = async () => {
    const { data } = await supabase
      .from('cloned_voices')
      .select('id, name, voice_id, preview_url, voice_gender')
      .order('created_at', { ascending: false });
    setClonedVoices((data ?? []) as ClonedVoice[]);
  };

  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    // Persist user selections (list group, selected leads, voice, instructions)
    // across re-opens and sub-dialog flows. Only load data once per session.
    if (hasLoadedRef.current) { loadClonedVoices(); return; }
    hasLoadedRef.current = true;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: leadRows }, { data: listingRows }, { data: profile }] = await Promise.all([
        supabase.from('leads').select('id, full_name, phone_number, city, deal_type, preferences')
          .not('phone_number', 'is', null).order('full_name', { ascending: true }).limit(1000),
        supabase.from('listings').select('id, property_title, city, asking_price, status')
          .eq('status', 'live').order('created_at', { ascending: false }).limit(200),
        user ? supabase.from('profiles').select('gender').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null } as any),
        loadClonedVoices(),
      ]);
      setLeads(((leadRows as any[]) ?? []).map(mapVoiceLead));
      setVoiceListings(((listingRows as any[]) ?? []).map((l) => ({
        id: l.id, title: l.property_title || 'נכס ללא כותרת', city: l.city ?? null, asking_price: l.asking_price ?? null,
      })));
      setUserGender(((profile as any)?.gender ?? null) as Gender | null);
      setLoading(false);

    })();
  }, [open]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    const digits = q.replace(/\D/g, '');
    return leads.filter((l) =>
      (l.full_name ?? '').toLowerCase().includes(q) ||
      (l.city ?? '').toLowerCase().includes(q) ||
      (digits.length > 0 && (l.phone ?? '').replace(/\D/g, '').includes(digits)),
    );
  }, [leads, search]);

  const allFilteredSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.has(l.id));
  const toggleAllFiltered = () => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredLeads.forEach((l) => next.delete(l.id));
      else filteredLeads.forEach((l) => next.add(l.id));
      return next;
    });
  };
  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const dial = async () => {
    const targets = listGroup === 'manual'
      ? leads.filter((l) => selectedLeadIds.has(l.id))
      : leads;
    if (targets.length === 0) { toast.error('אין מתעניינים זמינים לחיוג'); return; }
    const agent = allAgents.find((a) => a.id === agentId);
    if (!agent) { toast.error('בחר/י קול לפני החיוג'); return; }
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
            voice_gender: (agent as any).gender ?? null,
            user_gender: userGender,
            listing_id: selectedListingId ?? null,
            instructions: instructions.trim() || null,
          },
        });

        if (error) failed++; else ok++;
      }
      toast.dismiss('voice-dial');
      if (ok > 0) toast.success(`נשלחו ${ok} שיחות מ-${formatPhoneDisplay(VOICE_DIAL_NUMBER)}${failed ? ` · ${failed} נכשלו` : ''}`);
      else toast.error('כל השיחות נכשלו');
      if (ok > 0) {
        setListGroup(''); setAgentId(''); setInstructions(''); setSelectedListingId(null);
        setSearch(''); setSelectedLeadIds(new Set());

      }
      onClose();
    } finally {
      setDialing(false);
    }
  };

  const onAgentChange = (val: string) => {
    if (val === '__clone') { setUploadOpen(true); return; }
    if (val === '__elevenlabs') { setVoiceIdOpen(true); return; }
    setAgentId(val);
  };

  const playPreview = (url?: string | null) => {
    if (!url) return;
    try { new Audio(url).play(); } catch { /* ignore */ }
  };

  const canDial =
    !dialing &&
    !loading &&
    !!agentId &&
    (listGroup === 'manual' ? selectedLeadIds.size > 0 : leads.length > 0);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="sr-only">
            <DialogTitle>למי מחייגים?</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Broker gender — controls Hebrew grammar across the dialog and is
                persisted to profiles so future sessions don't need to ask. */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#0f1b3d]/15 bg-muted/30 px-3 py-2">
              <span className="text-[11px] font-semibold text-[#0f1b3d]">אני מתווך/ת:</span>
              <div className="flex gap-1">
                {([
                  { v: 'male' as const, label: 'גבר' },
                  { v: 'female' as const, label: 'אישה' },
                ]).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={async () => {
                      setUserGender(o.v);
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) await supabase.from('profiles').update({ gender: o.v }).eq('id', user.id);
                    }}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[11px] font-semibold transition',
                      userGender === o.v
                        ? 'border-[#0f1b3d] bg-[#0f1b3d] text-white'
                        : 'border-[#0f1b3d]/30 text-[#0f1b3d] hover:bg-[#0f1b3d]/5',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 1 — Target List */}

            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <Select value={listGroup} onValueChange={setListGroup} dir="rtl">
                <SelectTrigger className="w-full h-11 text-right text-[15px] text-muted-foreground/80 border-[#0f1b3d]/20 focus:ring-[#C9A84C] data-[placeholder]:text-muted-foreground/70">
                  <SelectValue placeholder="למי מחייגים?" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">כל הרשימה ({loading ? '…' : leads.length})</SelectItem>
                  <SelectItem value="manual">בחירה מהרשימה</SelectItem>
                  <SelectItem value="upload">העלאת רשימה (CSV / Excel)</SelectItem>
                  <SelectItem value="paste">הדבקת טקסט</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Step 1b — Multi-select lead grid (when manual) */}
            {listGroup === 'manual' && (
              <div className="rounded-lg border border-[#0f1b3d]/15 bg-background animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="p-2 border-b border-[#0f1b3d]/10">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש לפי שם או טלפון..."
                    className="text-right h-9 border-[#0f1b3d]/20 focus-visible:ring-[#C9A84C]"
                  />
                </div>
                <label className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#0f1b3d]/10 bg-muted/40 cursor-pointer">
                  <span className="text-xs font-semibold text-[#0f1b3d]">
                    בחר הכל ({filteredLeads.length})
                  </span>
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAllFiltered}
                    className="data-[state=checked]:bg-[#0f1b3d] data-[state=checked]:border-[#0f1b3d]"
                  />
                </label>
                <div className="max-h-60 overflow-y-auto divide-y divide-border/50">
                  {loading && <div className="p-3 text-center text-xs text-muted-foreground">טוען…</div>}
                  {!loading && filteredLeads.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">לא נמצאו מתעניינים</div>
                  )}
                  {!loading && filteredLeads.map((l) => {
                    const checked = selectedLeadIds.has(l.id);
                    return (
                      <label key={l.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-sm font-medium text-foreground truncate">{l.full_name || 'ללא שם'}</div>
                          <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                            {formatPhoneDisplay(l.phone)}
                          </div>
                          {(l.role || l.budget || l.city) && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5 justify-end">
                              {l.role && (
                                <span className="inline-flex items-center rounded-md bg-[#0f1b3d]/8 text-[#0f1b3d] border border-[#0f1b3d]/15 px-1.5 py-0.5 text-[10px] font-semibold">
                                  {l.role}
                                </span>
                              )}
                              {l.budget && (
                                <span className="inline-flex items-center rounded-md bg-white text-[#0f1b3d] border border-[#C9A84C]/60 px-1.5 py-0.5 text-[10px] font-mono" dir="ltr">
                                  {l.budget}
                                </span>
                              )}
                              {l.city && (
                                <span className="inline-flex items-center rounded-md bg-muted/60 text-[#0f1b3d]/80 border border-[#0f1b3d]/10 px-1.5 py-0.5 text-[10px]">
                                  {l.city}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleLead(l.id)}
                          className="rounded-full data-[state=checked]:bg-[#0f1b3d] data-[state=checked]:border-[#0f1b3d]"
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground text-right border-t border-[#0f1b3d]/10">
                  נבחרו {selectedLeadIds.size}
                </div>
              </div>
            )}

            {/* Step 2 — AI Agent Voice */}
            {listGroup && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <label className="text-xs font-semibold text-[#0f1b3d] text-right block">בחירת נציג/ת AI טלפונית</label>
                <Select value={agentId} onValueChange={onAgentChange} dir="rtl">
                  <SelectTrigger className="w-full text-right border-[#0f1b3d]/30 focus:ring-[#C9A84C]">
                    <SelectValue placeholder="בחר/י קול…" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {allAgents.map((a) => {
                      const preview = clonedVoices.find((v) => `cv:${v.id}` === a.id)?.preview_url ?? null;
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="inline-flex items-center gap-2">
                            <button type="button" onClick={(e) => { e.stopPropagation(); playPreview(preview); }}
                              className="text-[#C9A84C] hover:text-[#8a7327]">
                              <Play className="h-3 w-3" />
                            </button>
                            {a.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="__clone">+ הוסף קול חדש (שיבוט מהיר / HD)</SelectItem>
                    <SelectItem value="__elevenlabs">+ הוסף קול לפי Voice ID של ElevenLabs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 3 — Optional property focus + script + CTA */}
            {listGroup && agentId && (() => {
              // Build a dynamic placeholder from a real listing so the broker
              // sees a concrete example instead of a hard-coded street.
              const example = voiceListings[0];
              const examplePlaceholder = example
                ? `לדוגמה: "בדוק האם המתעניין עדיין מחפש נכס דומה ל-${example.title}${example.city ? ` ב${example.city}` : ''}, ועדכן אותו על האפשרות החדשה הזאת"`
                : 'לדוגמה: "בדוק האם המתעניין עדיין מחפש דירה לפי ההעדפות שלו, ועדכן אותו על נכס חדש שמתאים"';
              return (
                <>
                  {/* Property promotion picker — mirrors the FB post flow */}
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-xs font-semibold text-[#0f1b3d] text-right block">
                      קדם נכס ספציפי בשיחה (אופציונלי)
                    </label>
                    <Select
                      value={selectedListingId ?? '__none'}
                      onValueChange={(v) => setSelectedListingId(v === '__none' ? null : v)}
                      dir="rtl"
                    >
                      <SelectTrigger className="w-full text-right border-[#0f1b3d]/30 focus:ring-[#C9A84C]">
                        <SelectValue placeholder="בחר נכס מהמאגר…" />
                      </SelectTrigger>
                      <SelectContent dir="rtl" className="max-h-72">
                        <SelectItem value="__none">ללא קידום נכס ספציפי (שיחה כללית)</SelectItem>
                        {voiceListings.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.title}{l.city ? ` · ${l.city}` : ''}{l.asking_price ? ` · ₪${Number(l.asking_price).toLocaleString('he-IL')}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-xs font-semibold text-[#0f1b3d] text-right block">
                      הוראות, נושא או תסריט מותאם לשיחה (אופציונלי)
                    </label>
                    <Textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder={examplePlaceholder}
                      className="text-right min-h-[88px] border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C]"
                    />
                    <p className="text-[11px] text-muted-foreground text-right leading-snug">
                      אם {heVerb(userGender, 'תשאיר', 'תשאירי')} ריק, המערכת {heVerb(userGender, 'תשתמש', 'תשתמש')} באסטרטגיה האוטונומית הרגילה שלה המבוססת על הפרסונה של הסוכן, על מאגר הידע ועל היסטוריית השיחות עם המתעניין.
                    </p>
                  </div>

                  <DialogFooter className="mt-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                    <Button
                      onClick={dial}
                      disabled={!canDial}
                      className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 text-base font-semibold shadow-md"
                    >
                      <Phone className="ml-2 h-5 w-5" />
                      {dialing ? 'מפעיל שיחות…' : 'הפעלת שיחה'}
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}

          </div>
        </DialogContent>
      </Dialog>

      <AddVoiceUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={async (v) => { await loadClonedVoices(); setAgentId(`cv:${v.id}`); setUploadOpen(false); }}
      />
      <AddVoiceByIdDialog
        open={voiceIdOpen}
        onClose={() => setVoiceIdOpen(false)}
        onCreated={async (v) => { await loadClonedVoices(); setAgentId(`cv:${v.id}`); setVoiceIdOpen(false); }}
      />
    </>
  );
};

/* ───────────── Voice cloning sub-dialogs ───────────── */

const AddVoiceUploadDialog = ({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (v: ClonedVoice) => void }) => {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setName(''); setFile(null); setBusy(false); } }, [open]);

  const submit = async () => {
    if (!name.trim()) { toast.error('הקלידי שם לקול'); return; }
    if (!file) { toast.error('בחרי קובץ אודיו (MP3 / WAV)'); return; }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)) as any);
      }
      const audio_base64 = btoa(bin);
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: { action: 'clone_from_upload', name: name.trim(), audio_base64, mime: file.type || 'audio/mpeg', filename: file.name },
      });
      if (error || (data as any)?.error) {
        toast.error(`שיבוט הקול נכשל: ${(data as any)?.error ?? error?.message ?? 'שגיאה'}`);
        return;
      }
      toast.success(`הקול "${name}" נוסף בהצלחה`);
      onCreated((data as any).voice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-[#0f1b3d]">הוספת קול חדש (שיבוט מהיר / HD)</DialogTitle>
          <DialogDescription className="text-right">
            העלי דגימת אודיו נקייה של 30-60 שניות (MP3 / WAV) לשיבוט הקול דרך ElevenLabs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">שם הקול</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: אודי הקליט"
              className="text-right border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">קובץ אודיו</label>
            <Input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-right border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C]" />
            {file && (
              <p className="text-[11px] text-muted-foreground text-right">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button onClick={submit} disabled={busy}
            className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white">
            {busy ? 'משבט…' : 'שיבוט והוספה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddVoiceByIdDialog = ({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (v: ClonedVoice) => void }) => {
  const [name, setName] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setName(''); setVoiceId(''); setBusy(false); } }, [open]);

  const submit = async () => {
    if (!name.trim()) { toast.error('הקלידי שם לקול'); return; }
    if (!voiceId.trim()) { toast.error('הדביקי Voice ID של ElevenLabs'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: { action: 'register_voice_id', name: name.trim(), voice_id: voiceId.trim() },
      });
      if (error || (data as any)?.error) {
        toast.error(`הוספה נכשלה: ${(data as any)?.error ?? error?.message ?? 'שגיאה'}`);
        return;
      }
      toast.success('הקול התווסף בהצלחה למערכת!');
      onCreated((data as any).voice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-[#0f1b3d]">הוספת קול לפי Voice ID</DialogTitle>
          <DialogDescription className="text-right">
            הזיני את ה-Voice ID מ-ElevenLabs כדי לחבר קול קיים לחשבון.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">שם הקול</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: אודי HD"
              className="text-right border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">Voice ID</label>
            <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="EXAVITQu4vr4xnSDxMaL"
              dir="ltr" className="font-mono border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C]" />
          </div>
        </div>
        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button onClick={submit} disabled={busy}
            className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white">
            {busy ? 'שומר…' : 'שמירה'}
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
  const queryClient = useQueryClient();
  const { settings } = useWhiteLabel();
  const brandName = settings?.agency_name || 'Realtyz AI';
  const [pickedChannel, setPickedChannel] = useState<ChannelCard | null>(null);
  const [pickedChannelIds, setPickedChannelIds] = useState<Set<string>>(new Set());

  const [voiceDialChannel, setVoiceDialChannel] = useState<ChannelCard | null>(null);
  const [ivrOpen, setIvrOpen] = useState(false);
  const [emailSetupOpen, setEmailSetupOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null);
  // Bump to force-remount the InlineComposer so its body/selectedListingId/media
  // state fully clear after a successful (or paused) dispatch.
  const [composerResetTick, setComposerResetTick] = useState(0);
  const [alsoEmail, setAlsoEmail] = useState(false);
  // Hydrate connection state from sessionStorage so a page refresh doesn't
  // visually "disconnect" channels while the async verification re-runs.
  const [connectedChannels, setConnectedChannels] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('rz-connected-channels');
      if (raw) return new Set<string>(JSON.parse(raw));
    } catch { /* ignore */ }
    return EMPTY_CONNECTED;
  });
  const [channelAccountNames, setChannelAccountNames] = useState<Record<string, string>>(() => {
    try {
      const raw = sessionStorage.getItem('rz-connected-channel-names');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  });
  const [socialAccountProfiles, setSocialAccountProfiles] = useState<SocialAccountProfile[]>([]);

  const clearSocialConnectionState = (channels: string[] = ['facebook']) => {
    setConnectedChannels((prev) => new Set([...prev].filter((id) => !channels.includes(id))));
    setSocialAccountProfiles((prev) => prev.filter((p) => !channels.includes(p.platform) && !(channels.includes('facebook') && p.platform.startsWith('facebook'))));
    setChannelAccountNames((prev) => {
      const next = { ...prev };
      channels.forEach((id) => { delete next[id]; });
      return next;
    });
    try {
      const cached = sessionStorage.getItem('rz-connected-channels');
      if (cached) sessionStorage.setItem('rz-connected-channels', JSON.stringify((JSON.parse(cached) as string[]).filter((id) => !channels.includes(id))));
      const names = sessionStorage.getItem('rz-connected-channel-names');
      if (names) {
        const parsed = JSON.parse(names) as Record<string, string>;
        channels.forEach((id) => { delete parsed[id]; });
        sessionStorage.setItem('rz-connected-channel-names', JSON.stringify(parsed));
      }
    } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: ['social-connections'] });
    queryClient.invalidateQueries({ queryKey: ['workspace-social-profile'] });
    queryClient.invalidateQueries({ queryKey: ['ayrshare-social-accounts'] });
  };

  // Persist whenever the resolved connection state changes — keeps the grid
  // "remembered" for the whole browser session, including hard reloads.
  useEffect(() => {
    try { sessionStorage.setItem('rz-connected-channels', JSON.stringify([...connectedChannels])); } catch { /* ignore */ }
  }, [connectedChannels]);
  useEffect(() => {
    try { sessionStorage.setItem('rz-connected-channel-names', JSON.stringify(channelAccountNames)); } catch { /* ignore */ }
  }, [channelAccountNames]);

  // Default-select Facebook when it's connected and nothing is picked yet.
  useEffect(() => {
    if (pickedChannel) return;
    if (!connectedChannels.has('facebook')) return;
    const fb = CHANNEL_CARDS.find((c) => c.id === 'facebook');
    if (fb) {
      setPickedChannel(fb);
      setPickedChannelIds((prev) => (prev.has('facebook') ? prev : new Set(prev).add('facebook')));
    }
  }, [connectedChannels, pickedChannel]);




  // STRICT WORKSPACE ISOLATION: only show a channel as connected when
  // (1) this workspace owns a verified `workspace_social_profile` with its
  //     OWN `ayrshare_profile_key` (never a shared/global key), AND
  // (2) the channel exists in `social_connections` for the active user with
  //     `is_connected = true`. Otherwise every card defaults to "חבר".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user ?? null;
        if (!user) {
          if (!cancelled) { setConnectedChannels(EMPTY_CONNECTED); setSocialAccountProfiles([]); }
          return;
        }

        const { data: wsp } = await supabase
          .from('workspace_social_profile')
          .select('ayrshare_profile_key, facebook_page_id, facebook_page_name')
          .maybeSingle();
        const hasOwnProfile = !!(wsp as any)?.ayrshare_profile_key;
        const wspFbId = (wsp as any)?.facebook_page_id as string | null;
        const wspFbName = (wsp as any)?.facebook_page_name as string | null;
        if (!hasOwnProfile) {
          if (!cancelled) clearSocialConnectionState([...SOCIAL_CHANNEL_IDS]);
          // continue — still derive direct channels (IVR/email) below
        } else {
          if (wspFbName && !cancelled) {
            setChannelAccountNames((prev) => ({ ...prev, facebook: wspFbName }));
          }

          // Best-effort sync, throttled per browser session so route changes
          // don't repeatedly call the external account endpoint.
          try {
            const syncKey = 'realtyz.ayrshare_accounts_sync_at';
            const lastSyncAt = Number(sessionStorage.getItem(syncKey) || 0);
            if (!Number.isFinite(lastSyncAt) || Date.now() - lastSyncAt > CAMPAIGN_CACHE_MS) {
              await supabase.functions.invoke('ayrshare-sync-accounts', { body: {} });
              sessionStorage.setItem(syncKey, String(Date.now()));
            }
          } catch (e) {
            console.warn('[CampaignCenter] ayrshare-sync-accounts failed (non-fatal):', (e as Error)?.message);
          }
        }
        if (cancelled) return;

        const set = new Set<string>();

        if (hasOwnProfile) {
          // WORKSPACE-SHARED connection state — every workspace member sees the
          // same connected channels (owner / super-admin / managers / tenants).
          // No `created_by` / `user_id` filters here; RLS allows read for all
          // authenticated members.
          const { data: conns, error: connsErr } = await supabase
            .from('social_connections')
            .select('platform, is_connected')
            .eq('is_connected', true);
          const { data: accountRows, error: accountRowsErr } = await supabase
            .from('ayrshare_social_accounts')
            .select('id, platform, account_ref, profile_key, display_name, account_username, username, avatar_url, profile_url, connected, is_active')
            .eq('connected', true)
            .eq('is_active', true);
          if (cancelled) return;

          if (connsErr || accountRowsErr) {
            console.warn('[CampaignCenter] social conn fetch error:', connsErr?.message || accountRowsErr?.message);
          } else {
            // Dedupe by platform+account_ref so duplicate Ayrshare rows from
            // older imports don't render the same page twice on the FB card.
            const seenAcct = new Set<string>();
            const profiles = ((accountRows as any[]) || [])
              .map((r) => ({
                id: r?.id,
                platform: String(r?.platform || '').toLowerCase(),
                accountRef: r?.account_ref || '',
                profileKey: r?.profile_key || null,
                name: r?.display_name || r?.account_username || r?.username || r?.account_ref || 'Facebook',
                username: r?.account_username || r?.username || null,
                avatar: r?.avatar_url || null,
                profileUrl: r?.profile_url || (r?.account_ref ? buildAccountUrl(String(r?.platform || '').toLowerCase(), r.account_ref) : null),
              }))
              .filter((p) => {
                const k = `${p.platform}:${p.accountRef}`;
                if (seenAcct.has(k)) return false;
                seenAcct.add(k);
                return true;
              });
            profiles.forEach((p) => {
              if (p.platform.startsWith('facebook')) set.add('facebook');
            });
            if (!cancelled) setSocialAccountProfiles(profiles);
            (conns || []).forEach((c: any) => {
              const p = String(c?.platform || '').toLowerCase();
              if (p.startsWith('facebook')) set.add('facebook');
              else if (p.startsWith('instagram')) set.add('instagram');
              else if (p === 'x' || p === 'twitter') set.add('x');
              else if (p.startsWith('youtube')) set.add('youtube');
              else if (p.startsWith('linkedin')) set.add('linkedin');
              else if (p.startsWith('tiktok')) set.add('tiktok');
            });
            // Workspace fallback — if the singleton workspace profile has a
            // connected Facebook Page on record, trust it for every member
            // even before the sync/upsert finishes.
            if (wspFbId) set.add('facebook');
          }
        }


        // Direct (non-social) channels — always safe to derive.
        const [profRes, cfgsRes] = await Promise.all([
          supabase.from('profiles').select('direct_channels, email_alias, full_name').eq('id', user.id).maybeSingle(),
          supabase.from('api_configs').select('service_name, is_active'),
        ]);
        if (cancelled) return;

        const prof = profRes?.data ?? null;
        const cfgs = cfgsRes?.data ?? [];
        const direct = ((prof as any)?.direct_channels ?? {}) as Record<string, boolean>;
        const alias = (prof as any)?.email_alias as string | null;
        const activeServices = new Set(
          (cfgs || []).filter((r: any) => r?.is_active).map((r: any) => String(r?.service_name || '').toLowerCase()),
        );
        const hasVapi = activeServices.has('vapi');
        const hasTwilio = activeServices.has('twilio');
        const hasResend = activeServices.has('resend');
        const voiceReady = hasVapi && hasTwilio;

        if (direct?.ivr || voiceReady) set.add('ivr');
        if (direct?.['ai-call'] || hasVapi) set.add('ai-call');
        if ((direct?.email && alias) || alias || hasResend) set.add('email');

        if (!cancelled) {
          setChannelAccountNames((prev) => ({
            ...prev,
            ...(alias ? { email: `${alias}@realtyz.co.il` } : hasResend ? { email: 'Resend · אימייל מותג' } : {}),
            ...(voiceReady || direct?.ivr ? { ivr: VOICE_DIAL_NUMBER } : {}),
            ...(hasVapi || direct?.['ai-call'] ? { 'ai-call': VOICE_DIAL_NUMBER } : {}),
          }));
          setConnectedChannels(set);
        }
      } catch (err) {
        console.error('[CampaignCenter] integration context load failed:', err);
        if (!cancelled) {
          // Fail-safe: never crash the publishing workspace. Leave channels
          // empty so cards render their "חבר" state instead of unmounting.
          setConnectedChannels((prev) => prev ?? EMPTY_CONNECTED);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);


  const handleConnectChannel = async (c: ChannelCard, preOpened?: Window | null) => {
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
      const existingAlias = ((prof as any)?.email_alias ?? '').trim();
      if (!existingAlias) {
        // No alias yet — open inline provisioning modal
        setEmailSetupOpen(true);
        return;
      }
      const next = { ...(((prof as any)?.direct_channels ?? {}) as Record<string, boolean>), email: true };
      const { error: upErr } = await supabase.from('profiles').update({ direct_channels: next }).eq('id', user.id);
      if (upErr) { toast.error(upErr.message); return; }
      setConnectedChannels((prev) => new Set([...prev, 'email']));
      setChannelAccountNames((prev) => ({ ...prev, email: `${existingAlias}@realtyz.co.il` }));
      toast.success(`אימייל מותג מחובר: ${existingAlias}@realtyz.co.il`);
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
        if (preOpened) { try { preOpened.close(); } catch { /* ignore */ } }
        toast.error((data as any)?.error || 'לא התקבל קישור חיבור מ-Ayrshare');
        return;
      }
      if (preOpened && !preOpened.closed) {
        try { preOpened.location.href = url; } catch { window.open(url, '_blank', 'noopener,noreferrer'); }
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e: any) {
      toast.dismiss('ayr-connect');
      if (preOpened && !preOpened.closed) { try { preOpened.close(); } catch { /* ignore */ } }
      toast.error(e?.message ?? 'יצירת חיבור נכשלה');
    }
  };




  // Default landing view = sent campaigns feed. The composer panel is now
  // opened on demand via the "+" button in the page hero (see PageHero).
  const initial = (searchParams.get('tab') as string) ?? 'published';
  const active: TabValue = initial === 'calendar' ? 'calendar' : initial === 'create' ? 'create' : 'published';

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('sub');
    setSearchParams(next, { replace: true });
  };

  // Any scheduling flow (composer or EditRepostDialog) can request that the
  // user is dropped onto the calendar tab so they see every newly-scheduled
  // slot and can cancel them from there.
  useEffect(() => {
    const openCal = () => handleChange('calendar');
    window.addEventListener('rz:open-schedule-calendar', openCal as EventListener);
    return () => window.removeEventListener('rz:open-schedule-calendar', openCal as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
        {/* Sub-tabs intentionally hidden — primary view is the published feed,
            and the "+" button in the page hero toggles the composer panel. */}
        <TabsList className="sr-only" aria-hidden>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>


        <TabsContent value="create" className="mt-6 space-y-4">
          <ChannelGrid
            selectedIds={pickedChannelIds}
            onPick={(c) => {
              if (c.id === 'ivr') {
                setIvrOpen(true);
                return;
              }
              if (c.id === 'ai-call') {
                setVoiceDialChannel(c);
                return;
              }
              // Toggle multi-select; clicking an already-selected channel deselects it.
              setPickedChannelIds((prev) => {
                const next = new Set(prev);
                if (next.has(c.id)) {
                  next.delete(c.id);
                  if (pickedChannel?.id === c.id) {
                    const remainingId = [...next][next.size - 1];
                    const remaining = remainingId ? CHANNEL_CARDS.find((x) => x.id === remainingId) ?? null : null;
                    setPickedChannel(remaining);
                  }
                } else {
                  next.add(c.id);
                  setPickedChannel(c);
                }
                return next;
              });
            }}

            onConnect={handleConnectChannel}
            brandName={brandName}
            connected={connectedChannels}
            accountNames={channelAccountNames}
            socialProfiles={socialAccountProfiles}
            onAddFacebookPage={(w) => { void handleConnectChannel(CHANNEL_CARDS.find((c) => c.id === 'facebook')!, w); }}
          />
          {pickedChannel && (() => {
            const propertiesParam = searchParams.get('properties') || '';
            const propertyIds = propertiesParam.split(',').map((s) => s.trim()).filter(Boolean);
            let assignments: Array<{ iso: string; listing: string | null; variant: number; totalVariants: number }> = [];
            try {
              const raw = sessionStorage.getItem('rz-schedule-assignments');
              if (raw) assignments = JSON.parse(raw) || [];
            } catch {}
            // Single composer when no multi-property fan-out
            if (propertyIds.length <= 1) {
              return (
                <InlineComposer
                  key={`composer-${pickedChannel?.id ?? 'none'}-${composerResetTick}`}
                  channel={pickedChannel}
                  brandName={brandName}
                  socialProfiles={socialAccountProfiles}
                  onConfirm={(p) => setConfirmPayload(p)}
                  onOpenScheduleCalendar={() => handleChange('calendar')}
                />

              );
            }
            // One composer block per scheduled assignment — each tied to its
            // listing, slot time and variant index for independent generation
            // and an independent Approve/Schedule action.
            const blocks = assignments.length > 0
              ? assignments
              : propertyIds.map((lid, i) => ({ iso: searchParams.get('schedule') || new Date().toISOString(), listing: lid, variant: 1, totalVariants: 1 }));
            return (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-foreground" dir="rtl">
                  נוצרו <span className="font-bold">{blocks.length}</span> טיוטות פוסט עבור <span className="font-bold">{propertyIds.length}</span> נכסים. ערוך, אשר ושגר כל אחת בנפרד.
                </div>
                {blocks.map((b, idx) => (
                  <div key={`${b.listing || 'na'}-${b.iso}-${idx}-${composerResetTick}`} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground" dir="rtl">
                      טיוטה #{idx + 1} · {new Date(b.iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                      {b.totalVariants > 1 ? ` · וריאציה ${b.variant}/${b.totalVariants}` : ''}
                    </div>
                    <InlineComposer
                      channel={pickedChannel}
                      brandName={brandName}
                      socialProfiles={socialAccountProfiles}
                      onConfirm={(p) => setConfirmPayload(p)}
                      onOpenScheduleCalendar={() => handleChange('calendar')}
                      presetListingId={b.listing}
                      presetScheduleIso={b.iso}
                      presetVariant={b.variant}
                      presetVariants={b.totalVariants}
                      instanceId={`${idx}-${b.listing || 'na'}`}
                    />
                  </div>
                ))}
              </div>
            );
          })()}

        </TabsContent>
        <TabsContent value="published" className="mt-6">
          
          <PublishedFeed />
        </TabsContent>
        <TabsContent value="calendar" className="mt-6">
          <ScheduledCampaignCalendar
            onCreateAt={(iso, extras) => {
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'create');
              next.set('schedule', iso);
              if (extras?.listing) next.set('listing', extras.listing); else next.delete('listing');
              if (extras?.properties && extras.properties.length > 0) {
                next.set('properties', extras.properties.join(','));
              } else {
                next.delete('properties');
              }
              if (extras?.variant && extras?.totalVariants && extras.totalVariants > 1) {
                next.set('variant', String(extras.variant));
                next.set('variants', String(extras.totalVariants));
              } else {
                next.delete('variant');
                next.delete('variants');
              }
              // Persist full per-property assignments for the composer to read.
              if (extras?.assignments) {
                try { sessionStorage.setItem('rz-schedule-assignments', JSON.stringify(extras.assignments)); } catch {}
              }
              // Persist selected Facebook groups so the composer picks them up
              // (it hydrates `groupIds` from this localStorage key on mount).
              if (extras?.groupIds && extras.groupIds.length > 0) {
                try { localStorage.setItem('campaign:groupIds', JSON.stringify(extras.groupIds)); } catch {}
              }
              setSearchParams(next, { replace: false });
            }}
            onClose={() => handleChange('published')}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDispatchDialog
        open={!!confirmPayload}
        onClose={() => setConfirmPayload(null)}
        channel={pickedChannel}
        body={confirmPayload?.body ?? ''}
        originalAiBody={confirmPayload?.original_ai_body ?? ''}
        listingId={confirmPayload?.listing_id ?? null}
        brandName={brandName}
        mediaUrls={confirmPayload?.media_urls ?? []}
        scheduledAt={confirmPayload?.scheduled_at ?? null}
        groupIds={confirmPayload?.group_ids ?? []}
        selectedProfileIds={confirmPayload?.selected_profile_ids ?? []}
        attachWaLink={confirmPayload?.attach_wa_link ?? false}
        firstComment={confirmPayload?.first_comment ?? ''}
        onConfirmed={async () => {
          const body = confirmPayload?.body ?? '';
          const shouldEmail = alsoEmail && pickedChannel?.id !== 'email' && connectedChannels.has('email') && body.trim().length > 0;
          const publishedChannelId = pickedChannel?.id;
          setConfirmPayload(null);
          setPickedChannel(null);
          setPickedChannelIds(new Set());
          // Force-remount InlineComposer so body + selected property + media
          // fully reset, then jump to the sent-campaigns feed so the user
          // immediately sees the freshly logged row.
          setComposerResetTick((t) => t + 1);
          handleChange('published');
          if (publishedChannelId) {
            const prefixes = [`rz-composer-draft:v2:${publishedChannelId}`, `rz-composer-draft:${publishedChannelId}`];
            try {
              for (const prefix of prefixes) {
                sessionStorage.removeItem(prefix);
                localStorage.removeItem(prefix);
                // Sweep namespaced draft entries (replicated composers)
                for (const store of [localStorage, sessionStorage]) {
                  const keys: string[] = [];
                  for (let i = 0; i < store.length; i++) {
                    const k = store.key(i);
                    if (k && k.startsWith(`${prefix}:`)) keys.push(k);
                  }
                  keys.forEach((k) => store.removeItem(k));
                }
              }
              sessionStorage.removeItem('rz-schedule-assignments');
            } catch {}
          }

          setAlsoEmail(false);
          if (shouldEmail) {
            try {
              const { data: leads } = await supabase.from('leads').select('id, full_name, email').limit(100);
              let sent = 0;
              for (const l of (leads || []) as any[]) {
                if (!l.email) continue;
                const { error } = await supabase.functions.invoke('resend-email-sender', {
                  body: {
                    recipient_email: l.email,
                    recipient_name: l.full_name,
                    subject: `${brandName} · עדכון אישי עבורך`,
                    intro: body,
                    cta_question: 'מתי נוח לך לקפוץ לראות?',
                  },
                });
                if (!error) sent++;
              }
              if (sent > 0) toast.success(`נשלחו גם ${sent} מיילים`);
            } catch (err: any) {
              toast.error(`כשל בשליחת מיילים: ${err?.message || 'שגיאה'}`);
            }
          }
        }}
      />
      <VoiceLeadPickerDialog
        open={!!voiceDialChannel}
        onClose={() => setVoiceDialChannel(null)}
        channel={voiceDialChannel}
      />
      <IvrBroadcastDialog open={ivrOpen} onClose={() => setIvrOpen(false)} />
      <EmailAliasSetupDialog
        open={emailSetupOpen}
        onClose={() => setEmailSetupOpen(false)}
        onConnected={(alias) => {
          setConnectedChannels((prev) => new Set([...prev, 'email']));
          setChannelAccountNames((prev) => ({ ...prev, email: `${alias}@realtyz.co.il` }));
        }}
      />
    </div>
  );
};


export default CampaignCenter;
