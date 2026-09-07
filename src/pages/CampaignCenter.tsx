import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';
import { shortenName } from "@/lib/shortenName";
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


import { Label } from '@/components/ui/label';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrandIcon } from '@/components/BrandIcon';
import {
  ArrowRight, Plus, Bot, Mail, Phone, MessageSquare, Heart, Share2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Send, Mic, Image as ImageIcon, Paperclip,
  ChevronDown as ChevronDownIcon, Plug, Camera, Sparkles, Square, Users,
  Trash2, ExternalLink, CheckCircle2, Play, RefreshCw, Calendar as CalendarIcon, Loader2, AlertTriangle, Pencil, Megaphone, History, Save } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


import { supabase } from '@/integrations/supabase/client';
import { nextBlockedKeys } from '@/lib/mediaBlocklist';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import {
  enqueueExtensionPosts,
  useExtensionQueue,
  queueStatusForText,
  isLegacyMetaGroupError,
  resetQueueEntriesForText,
} from '@/lib/extensionGroupBridge';
import { toast } from 'sonner';
import { isGenerationStopped, stopAllGeneration, resumeGeneration, subscribeGenerationGate, registerGeneration, releaseGeneration } from '@/lib/generationGate';
import { loadSchedulePrefs, saveSchedulePrefs, DEFAULT_SCHEDULE_PREFS, type SchedulePrefs } from '@/lib/schedulePrefs';
import { loadCampaignGroups, saveCampaignGroups, subscribeCampaignGroups } from '@/lib/campaignGroups';
import { useFbGroupMeta } from '@/hooks/useFbGroupMeta';

import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { nativeWaLink } from '@/lib/officialWa';
import { cn } from '@/lib/utils';

import { CampaignCommentsStream } from '@/components/campaigns/CampaignCommentsStream';
import EditRepostDialog from '@/components/campaigns/EditRepostDialog';
import { DeletePostDialog } from '@/components/campaigns/DeletePostDialog';
import { GroupStatusChips, groupResultMap } from '@/components/campaigns/GroupStatusChips';
import { QueueCard } from '@/components/campaigns/QueueCard';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';
import { ScheduledCountdown } from '@/components/campaigns/ScheduledCountdown';
import { EditScheduledSeriesDialog } from '@/components/campaigns/EditScheduledSeriesDialog';
import { CustomGroupsQuickShare } from '@/components/social/CustomGroupsQuickShare';
import { CampaignGroupBreakdown } from '@/components/social/CampaignGroupBreakdown';
import { campaignMatchesExternalPost, normalizePostId, getCampaignPostIds, platformForCampaignChannel } from '@/lib/campaignPostIds';
import { learnFromEdit } from '@/lib/learnFromEdit';
import { uploadMediaToLibrary } from '@/lib/mediaUpload';
import { MAX_POST_IMAGES, randomImageSet, requestSmartMediaFilter } from '@/lib/listingImages';
import { resolveMediaUrl, resolveMediaUrls, mediaDedupeKey } from '@/lib/postMediaUrl';

import { stripAddressNumbers } from '@/lib/formatAddress';
import { IvrBroadcastDialog } from '@/components/campaigns/IvrBroadcastDialog';
import { EmailAliasSetupDialog } from '@/components/campaigns/EmailAliasSetupDialog';
import { ScheduledCampaignCalendar } from '@/components/campaigns/ScheduledCampaignCalendar';
import { ScheduleCurrentPostDialog } from '@/components/campaigns/ScheduleCurrentPostDialog';
import { PostImage } from '@/components/campaigns/PostImage';
import { SupportRequiredDialog, isNativeChannel } from '@/components/campaigns/SupportRequiredDialog';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';

import { searchAllSources } from '@/lib/propertySearch';
import { autoImportResult } from '@/lib/propertyAutoImport';
import { SourceBadge } from '@/components/properties/SourceBadge';

import { getCampaignWorkspaceUserIds } from '@/lib/campaignWorkspace';
import {
  type ComposerSession,
  type ComposerAssignment,
  readComposerSessionLocal,
  fetchComposerSession,
  saveComposerSession,
  clearComposerSession,
  saveComposerDraftCloud,
  fetchComposerDraftCloud,
  clearComposerDraftsCloud,
} from '@/lib/composerSession';

import {
  hebrewOnlyParts, hebrewPropertyType, sanitizeFloor, sanitizeRooms, sanitizeSqm,
  floorsInBuildingFromSqm,
} from '@/lib/propertyMeasures';



/**
 * Removes saved composer drafts for a channel from both stores.
 * Called after a successful submit so the text area starts empty again.
 */
const sweepComposerDraftKeys = (channelId: string, suffix?: string) => {
  for (const store of [localStorage, sessionStorage]) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k || !k.startsWith('rz-composer-draft:')) continue;
      if (!k.includes(`:${channelId}`)) continue;
      if (suffix && !k.endsWith(`:${suffix}`)) continue;
      keys.push(k);
    }
    keys.forEach((k) => store.removeItem(k));
  }
};

// One-time purge of pre-workspace-scoped drafts (v1/v2). Those keys were shared
// across every workspace in this browser, which is how a post from another
// office could reappear here after a refresh.
try {
  if (typeof window !== 'undefined' && !localStorage.getItem('rz-composer-draft-purge:v3')) {
    for (const store of [localStorage, sessionStorage]) {
      const stale: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith('rz-composer-draft:') && !k.startsWith('rz-composer-draft:v3:')) stale.push(k);
        if (k && k.startsWith('rz_post_cache:') && !k.startsWith('rz_post_cache:v2:')) stale.push(k);
      }
      stale.forEach((k) => store.removeItem(k));
    }
    localStorage.setItem('rz-composer-draft-purge:v3', '1');
  }
} catch { /* storage unavailable */ }

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
  /** "פרסם גם בעמוד הפייסבוק העסקי" — default true. */
  publish_to_page?: boolean;
  selected_profile_ids: string[];
  attach_wa_link: boolean;
  first_comment: string;
  first_comment_enabled: boolean;
  attach_msngr_link: boolean;
};

// Media URL handling lives in src/lib/postMediaUrl.ts so the feed, the post
// card and the cache resolver all agree on what a valid absolute URL is.
const isRenderablePostMediaUrl = (value: unknown): value is string => resolveMediaUrl(value) !== '';

const normalizePostMediaUrls = (value: unknown): string[] => resolveMediaUrls(value);


const mergePostMediaUrls = (...values: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    for (const url of normalizePostMediaUrls(value)) {
      const key = mediaDedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
};

// Strict uniqueness: exact URL AND canonical filename key. Used at render time
// so a post can never paint the same image twice.
const uniqueMediaUrls = (values: unknown): string[] => {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const seenExact = new Set<string>();
  const seenKey = new Set<string>();
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== 'string' || !value) continue;
    const key = mediaDedupeKey(value);
    if (seenExact.has(value) || seenKey.has(key)) continue;
    seenExact.add(value);
    seenKey.add(key);
    out.push(value);
  }
  return out;
};


// Images the user explicitly deleted from a post. Persisted in
// campaign_logs.provider_response.removed_media_keys so no sync/merge path can
// ever resurrect them.
const readRemovedMediaKeys = (providerResponse: unknown): string[] => {
  const raw = (providerResponse as any)?.removed_media_keys;
  return Array.isArray(raw)
    ? raw.filter((k) => typeof k === 'string' && k).map((k) => k.toLowerCase())
    : [];
};

const dropRemovedMedia = (urls: string[], removedKeys: string[]): string[] => {
  if (removedKeys.length === 0) return urls;
  const blocked = new Set(removedKeys);
  return urls.filter((u) => !blocked.has(mediaDedupeKey(u)));
};

const keepLongestMediaUrls = (current: unknown, incoming: unknown): string[] => {
  const currentUrls = normalizePostMediaUrls(current);
  const incomingUrls = normalizePostMediaUrls(incoming);
  if (incomingUrls.length === 0) return currentUrls;
  if (currentUrls.length === 0) return incomingUrls;
  return incomingUrls.length >= currentUrls.length ? incomingUrls : currentUrls;
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
// each workspace must own its own connected Meta Page before any channel can
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
  onAddFacebookPage?: () => void;
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
            const isSelected = selectedIds.has(p.id);
            // A selected channel always renders in full brand color, even while
            // the connection probe is still resolving server-side.
            const lit = isConnected || isSelected;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen((v) => !v)}
                title={p.label}
                aria-label={p.label}
                aria-pressed={isSelected}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-opacity',
                  lit ? 'opacity-100' : 'opacity-70 hover:opacity-100',
                )}
              >
                <BrandIcon
                  name={p.brand}
                  aria-label={p.label}
                  className={cn('h-5 w-5', lit ? (BRAND_COLOR[p.id] ?? 'text-slate-600') : 'text-slate-500')}
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
            // Selection is never blocked by the connection probe: a channel the
            // user picked (or one already bound server-side) renders as active.
            const lit = isConnected || isSelected;
            const brandColor = lit ? (BRAND_COLOR[c.id] ?? c.iconColor ?? 'text-foreground') : 'text-muted-foreground/60';
            const profiles = socialProfiles.filter((p) => p.platform === c.id || (c.id === 'x' && p.platform === 'twitter'));
            return (
              <button key={c.id} type="button"
                onClick={() => onPick(c)}

                aria-pressed={isSelected}
                className={cn(
                  'group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-background p-3 text-center transition active:scale-[0.98] cursor-pointer',
                  !lit && 'border-dashed border-border bg-muted/30 hover:border-border hover:bg-muted/50',
                  lit && !isSelected && 'border-[#C9A84C]/60 hover:border-[#C9A84C] hover:shadow-md',
                  isSelected && 'border-primary ring-2 ring-primary/30 shadow-md',
                )}>
                {isSelected && (
                  <span aria-hidden className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-primary" title="נבחר">

                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                )}

                {c.id === 'facebook' && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onAddFacebookPage?.(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onAddFacebookPage?.(); } }}
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
                  lit ? 'text-foreground' : 'text-muted-foreground/70',
                )}>
                  {c.label}
                </span>

                {c.free ? (
                  <span className={cn('text-[11px] font-bold', lit ? 'text-primary' : 'text-muted-foreground/60')}>
                    חינם
                  </span>
                ) : (
                  <span className={cn('text-[12px] font-bold', lit ? 'text-foreground' : 'text-muted-foreground/60')} dir="ltr">
                    <bdi dir="ltr">₪{c.price}</bdi>
                  </span>
                )}

                {!isConnected && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onConnect(c); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onConnect(c); } }}
                    className="mt-0.5 text-[10px] font-bold text-primary underline decoration-dotted"
                  >
                    חבר
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
                        <span key={profile.id} className="block min-w-0 max-w-full text-center">
                          <span
                            role={url ? 'link' : undefined}
                            tabIndex={url ? 0 : undefined}
                            onClick={url ? handleOpen : undefined}
                            onKeyDown={url ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen(e as unknown as React.MouseEvent); } : undefined}
                            className={cn('block truncate whitespace-nowrap text-[10px] font-bold text-[#8a7327]', url && 'cursor-pointer hover:underline')}
                            title={profile.name}
                          >
                            {shortenName(profile.name, 26)}
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
  // Strip any signature / phone / license lines that the model may have produced.
  // Never keyed to a specific person — only to signature-shaped patterns.
  .replace(/\n*\s*(?:📞|☎️|📱)?\s*0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}[^\n]*/gu, '')
  .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, '')
  .replace(/\n*\s*רישיון\s*תיווך[^\n]*/gu, '')
  // No English keywords in first comments (URLs are preserved as-is).
  .split('\n')
  .map((line) => (/https?:\/\/|wa\.me|m\.me/i.test(line)
    ? line
    : line
        .replace(/\b[A-Za-z][A-Za-z'׳-]*\b/g, '')
        .replace(/\|\s*(?=\|)/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s*\|\s*$/, '')
        .trimEnd()))
  .join('\n')
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

// Real, human post title: property type + address (+ city). Never a placeholder.
const listingHeadline = (listing: CampaignListing | null | undefined): string => {
  if (!listing) return '';
  const meta = (listing.source_metadata || {}) as Record<string, unknown>;
  const featuresObj = (listing.features && !Array.isArray(listing.features) && typeof listing.features === 'object')
    ? (listing.features as Record<string, unknown>)
    : {};
  const type = hebrewPropertyType(meta.property_type || featuresObj.property_type || '');
  const place = listing.address || listing.property_title || listing.neighborhood || '';
  const parts = [type, place ? String(place) : null, listing.city ? String(listing.city) : null]
    .filter(Boolean)
    .map((s) => String(s).trim());
  return Array.from(new Set(parts)).join(' · ');
};

const buildFirstCommentKeywordLine = (listing: CampaignListing | null | undefined) => {

  if (!listing) return '';
  const meta = (listing.source_metadata || {}) as Record<string, unknown>;
  const featuresObj = (listing.features && !Array.isArray(listing.features) && typeof listing.features === 'object')
    ? (listing.features as Record<string, unknown>)
    : {};
  // Hebrew only: never surface English source values such as "apartment".
  const sourceType = hebrewPropertyType(meta.property_type || featuresObj.property_type || '');
  const sqm = sanitizeSqm(listing.sqm);
  const floor = sanitizeFloor(listing.floor);
  const rooms = sanitizeRooms(listing.rooms);
  const parts = [
    sourceType,
    listing.city ? String(listing.city) : null,
    listing.address ? stripAddressNumbers(listing.address) : (listing.neighborhood ? String(listing.neighborhood) : null),
    rooms !== null ? `${rooms} חדרים` : null,
    floor !== null ? `קומה ${floor}` : null,
    sqm !== null ? `${sqm} מ"ר` : null,
    ...extractListingFeatureFlags(listing),
  ].filter(Boolean) as string[];
  return Array.from(new Set(hebrewOnlyParts(parts.map((s) => s.trim())))).join(' | ');
};


// Hard cap: the property line in the first comment is at most 10 words.
const limitToTenWords = (line: string) =>
  String(line || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 10)
    .join(' ')
    .replace(/[,;:\-–—]+$/, '');

const buildFallbackFirstComment = (listing: CampaignListing | null) => {
  const city = normalizeListingText(listing?.city) || 'הרצליה';
  const neighborhood = normalizeListingText(listing?.neighborhood);
  const rooms = listing?.rooms ? `${listing.rooms} חדרים` : '';
  const location = [neighborhood, city].filter(Boolean).join(', ') || city;
  const keywordLine = buildFirstCommentKeywordLine(listing);
  const propertyPhrase = rooms ? `דירת ${rooms} ב${location}` : `נכס ב${location}`;
  const variants = [
    `${propertyPhrase} — הזדמנות שכדאי לראות.`,
    `${propertyPhrase} עם מיקום נכון ופוטנציאל אמיתי.`,
    `${propertyPhrase} שמשלב מיקום ואופי, שווה ביקור.`,
  ];
  const oneLiner = limitToTenWords(variants[Math.floor(Math.random() * variants.length)]);
  return `${oneLiner}\n${keywordLine}`.trim();
};

/** Live status of a single draft, surfaced on its collapsed wrapper card. */
type ComposerStatus = {
  title: string;
  generating: boolean;
  photosLoading: boolean;
  images: number;
  chars: number;
  ready: boolean;
  /** True when this draft has everything it needs to be dispatched. */
  canPublish: boolean;
  /** First attached image, shown as a thumbnail on the collapsed card. */
  thumb: string | null;
};

/**
 * Stable identity of a draft inside the multi-draft composer.
 * Keyed by listing + variant (NOT by array index) so restoring after a refresh
 * or a reshuffled property rotation always finds the same saved draft.
 */
const draftKeyFor = (b: { listing?: string | null; variant?: number }, idx: number): string =>
  `${b.listing || `na${idx}`}::v${b.variant ?? 1}`;

const InlineComposer = ({
  channel, brandName, socialProfiles = [], onConfirm, onOpenScheduleCalendar,
  presetListingId, presetScheduleIso, presetVariant, presetVariants, instanceId, onStatus,
  onRegisterPublish, bulkGroupIds, bulkScheduleIso, onBulkGroupIdsChange, hideBottomBar,
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
  /** Lets a collapsed wrapper card mirror this draft's live status. */
  onStatus?: (status: ComposerStatus) => void;
  /**
   * Exposes this draft's publish action to the parent, so a collapsed card
   * header and the "publish all drafts" bar can dispatch it.
   * The returned function reports whether the draft was publishable.
   */
  onRegisterPublish?: (fn: (() => boolean) | null) => void;
  /** Bulk override from the page-level bottom bar — updates all drafts at once. */
  bulkGroupIds?: string[];
  bulkScheduleIso?: string | null;
  /** Reports group selection changes back to the page-level bar so the bubble count stays accurate. */
  onBulkGroupIdsChange?: (ids: string[]) => void;
  /** When rendered inside a collapsed draft card the page-level bar handles dispatch. */
  hideBottomBar?: boolean;
}) => {
  // Persistent draft key — namespaced per replicated instance AND per active
  // workspace, so a draft written in one office can never resurface inside
  // another one. Persisted to localStorage so dialog closes, route changes,
  // and hard refreshes never lose unfinished work.
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const wsScope = workspaceOwnerId ?? 'anon';
  const draftKey = `rz-composer-draft:v3:${wsScope}:${channel.id}${instanceId ? `:${instanceId}` : ''}`;
  const readDraft = (): any => {
    if (typeof window === 'undefined') return null;
    try {
      const direct = JSON.parse(localStorage.getItem(draftKey) || sessionStorage.getItem(draftKey) || 'null');
      if (direct && String(direct.body || '').trim()) return direct;
      // Rescue only inside the SAME workspace scope: a draft written in another
      // office must never be restored here.
      if (presetListingId) {
        const prefix = `rz-composer-draft:v3:${wsScope}:${channel.id}:`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith(prefix) || k === draftKey) continue;
          try {
            const val = JSON.parse(localStorage.getItem(k) || 'null');
            if (val && String(val.body || '').trim() && val.selectedListingId === presetListingId) return val;
          } catch { /* skip */ }
        }
      }
      return direct;
    } catch { return null; }
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
  const [attachWaLink, setAttachWaLink] = useState<boolean>(initial.attachWaLink ?? true);
  const [attachMsngrLink, setAttachMsngrLink] = useState<boolean>(!!initial.attachMsngrLink);
  // First-comment auto-post: when enabled, the branded first-comment text is
  // posted as the first comment on the published post via the Meta API.
  const [firstCommentEnabled, setFirstCommentEnabled] = useState<boolean>(initial.firstCommentEnabled ?? true);
  // "פרסם גם בעמוד הפייסבוק העסקי" — on by default. When off, the post is
  // published only to the selected Facebook groups.
  const [publishToPage, setPublishToPage] = useState<boolean>(initial.publishToPage ?? true);
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
    const listingParam = presetListingId
      ?? params.get('listing')
      ?? (params.get('properties') || '').split(',').map((s) => s.trim()).filter(Boolean)[0]
      ?? null;
    if (listingParam) setSelectedListingId(listingParam);

    const variant = presetVariant ?? Number(params.get('variant') || '');
    const variants = presetVariants ?? Number(params.get('variants') || '');
    if (variant > 0 && variants > 1) {
      // Anti-ban variation directive — Facebook will throttle or
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

  // Bulk override from the page-level bottom bar — update every draft at once.
  useEffect(() => {
    // A freshly mounted parent starts with [] until its workspace preferences
    // hydrate. Never let that transient value erase the groups stored with the
    // draft (for example the user's 24 selected groups).
    if (bulkGroupIds && bulkGroupIds.length > 0) setGroupIds(bulkGroupIds);
  }, [bulkGroupIds]);

  useEffect(() => {
    if (bulkScheduleIso) {
      const d = new Date(bulkScheduleIso);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setScheduledLocal(local);
        setMode('scheduled');
      }
    }
  }, [bulkScheduleIso]);


  // Multi-select of connected Facebook Group IDs to fan-out a single post to.
  // Persisted to localStorage (per workspace) so a reload / background refresh
  // doesn't wipe the selection, and the bulk picker stays in sync with drafts.
  // (workspaceOwnerId is declared at the top of this component, next to draftKey)
  const groupStorageKey = workspaceOwnerId ? `campaign:selectedGroups:${workspaceOwnerId}` : 'campaign:selectedGroups';
  const [groupIds, setGroupIds] = useState<string[]>(() => {
    const savedWithDraft = Array.isArray(initial.groupIds)
      ? initial.groupIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    return savedWithDraft;
  });
  const groupsHydratedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hideBottomBar) {
      // In multi-draft mode the page-level bulk bar is the source of truth.
      if (bulkGroupIds && bulkGroupIds.length) { setGroupIds(bulkGroupIds); groupsHydratedRef.current = true; }
      return;
    }
    if (!workspaceOwnerId) return;
    const shared = loadCampaignGroups(workspaceOwnerId);
    if (shared.length) setGroupIds(shared);
    groupsHydratedRef.current = true;
  }, [groupStorageKey, hideBottomBar, bulkGroupIds, workspaceOwnerId]);
  useEffect(() => {
    if (hideBottomBar) return; // page-level bar owns persistence in multi-draft mode
    // Never write an empty selection before hydration finished — that wiped the
    // saved 24-group selection and reset every counter to 0.
    if (!workspaceOwnerId || !groupsHydratedRef.current) return;
    const shared = loadCampaignGroups(workspaceOwnerId);
    if (shared.join(',') !== groupIds.join(',')) saveCampaignGroups(workspaceOwnerId, groupIds);
  }, [groupIds, workspaceOwnerId, hideBottomBar]);

  // The scheduling dialog and the calendar write to the same shared store —
  // mirror their changes back so every counter shows the identical number.
  useEffect(() => subscribeCampaignGroups((ids) => {
    groupsHydratedRef.current = true;
    setGroupIds(ids);
  }), []);

  // Active repeat method of the composer scheduling dialog — surfaced as a
  // bubble on the calendar button so the broker always sees the live series.
  const [composerRecurrence, setComposerRecurrence] = useState<SchedulePrefs['recurrence']>('none');
  useEffect(() => {
    const read = () => setComposerRecurrence(loadSchedulePrefs(workspaceOwnerId, 'composer').recurrence);
    read();
    const t = window.setInterval(read, 1500);
    return () => window.clearInterval(t);
  }, [workspaceOwnerId, scheduleDialogOpen]);
  const recurrenceBubble = composerRecurrence === 'daily' ? 'יומי'
    : composerRecurrence === 'weekly' ? 'שבועי'
    : composerRecurrence === 'monthly' ? 'חודשי'
    : composerRecurrence === 'custom' ? 'מותאם'
    : null;



  useEffect(() => {
    if (!groupsHydratedRef.current || groupIds.length === 0) return;
    onBulkGroupIdsChange?.(groupIds);
  }, [groupIds, onBulkGroupIdsChange]);



  // Group picker modal (opened from the group icon button next to "פרסם").
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupTextVariation, setGroupTextVariation] = useState<boolean>(() => {
    try { return localStorage.getItem('campaign:groupTextVariation') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('campaign:groupTextVariation', groupTextVariation ? 'true' : 'false'); } catch {}
  }, [groupTextVariation]);
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
  const [externalResults, setExternalResults] = useState<import('@/lib/propertySearch').UnifiedResult[]>([]);
  const [externalSearching, setExternalSearching] = useState(false);
  const [importingExternalKey, setImportingExternalKey] = useState<string | null>(null);


  // Attachment / media state
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ name: string; kind: 'image' | 'file' | 'audio'; url?: string }[]>(initial.attachments || []);
  // True while the property's gallery is being pulled/attached.
  const [photosLoading, setPhotosLoading] = useState(false);
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

  // True once this instance finished restoring (locally or from the cloud).
  // Auto-generation and every persist write must wait for it, otherwise a
  // refresh re-writes (and erases) the draft.
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  useEffect(() => { hydratedRef.current = hydrated; }, [hydrated]);


  // Persist composer draft to localStorage so collapsing/switching tabs,
  // closing dialogs, navigating away, or hard-refreshing never loses work.
  // CRITICAL: nothing is written before hydration finished, otherwise the
  // transient empty state of a freshly mounted replica overwrites (and erases)
  // the saved draft — that is exactly how 7 drafts used to lose their text.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydratedRef.current) return;
    try {
      const snapshot = {
        body,
        customInstructions,
        selectedListingId,
        attachments,
        logId,
        firstComment,
        firstCommentEnabled,
        attachWaLink,
        attachMsngrLink,
        publishToPage,
        groupIds,
        mode,
        scheduledLocal,
      };
      // Never downgrade a stored draft that has text into a textless one.
      if (!snapshot.body.trim()) {
        const prev = readDraft();
        if (prev && String(prev.body || '').trim()) return;
      }
      localStorage.setItem(draftKey, JSON.stringify(snapshot));
      // Durable mirror: an unpublished draft must survive a cleared browser
      // cache, another tab, or another device.
      if (snapshot.body.trim() || snapshot.attachments.length > 0 || snapshot.firstComment.trim()) {
        const handle = window.setTimeout(() => {
          void saveComposerDraftCloud(channel.id, instanceId ?? 'single', snapshot);
        }, 900);
        return () => window.clearTimeout(handle);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, body, customInstructions, selectedListingId, attachments, logId, firstComment, firstCommentEnabled, attachWaLink, attachMsngrLink, publishToPage, groupIds, mode, scheduledLocal, hydrated]);

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

  // On channel change: rehydrate from saved draft for that channel (keeps unfinished work alive per platform).
  // Exception — when the composer was deep-linked with a property (?listing= /
  // ?properties= or a presetListingId), that property wins over the stale draft
  // so the dropdown shows it and auto-generation can fire immediately.
  const deepLinkListingId = useMemo(() => {
    if (presetListingId) return presetListingId;
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('listing') ||
      (params.get('properties') || '').split(',').map((s) => s.trim()).filter(Boolean)[0] ||
      null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetListingId]);


  useEffect(() => {
    const saved = readDraft() || {};
    // A saved draft ALWAYS wins over the preset/deep-linked listing: after a
    // refresh every replica is re-mounted with its preset listing, and wiping
    // here is exactly what used to erase the operator's 7 drafts.
    const savedHasWork =
      String(saved.body || '').trim().length > 0 ||
      (Array.isArray(saved.attachments) && saved.attachments.length > 0) ||
      String(saved.firstComment || '').trim().length > 0;
    const deepLinked = !!deepLinkListingId && !savedHasWork;
    setBody(deepLinked ? '' : cleanBody(saved.body || ''));
    setCustomInstructions(saved.customInstructions || '');
    setSelectedListingId(saved.selectedListingId ?? deepLinkListingId ?? null);
    setAttachments(deepLinked ? [] : (saved.attachments || []));
    setLogId(deepLinked ? null : (saved.logId ?? null));
    setFirstComment(deepLinked ? '' : (saved.firstComment || ''));
    setFirstCommentEnabled(saved.firstCommentEnabled ?? true);
    setAttachWaLink(saved.attachWaLink ?? true);
    setAttachMsngrLink(!!saved.attachMsngrLink);
    const restoredSchedule = String(saved.scheduledLocal || '').trim();
    if (restoredSchedule) {
      setScheduledLocal(restoredSchedule);
      setMode('scheduled');
    } else if (!presetScheduleIso) {
      setMode(saved.mode === 'scheduled' ? 'scheduled' : 'now');
    }
    setListingQuery('');
    setSaveState('idle');
    if (savedHasWork) setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, deepLinkListingId]);

  // Cloud fallback: if this browser has no local copy of the draft (cleared
  // cache, new tab, other device, new auth session), pull the durable mirror
  // back in — even for preset/deep-linked replicas.
  useEffect(() => {
    const local = readDraft();
    if (local && (String(local.body || '').trim() || (local.attachments || []).length > 0)) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const cloud = await fetchComposerDraftCloud(channel.id, instanceId ?? 'single');
      if (cancelled) return;
      if (cloud) {
        if (String(cloud.body || '').trim()) setBody(cleanBody(cloud.body));
        if (cloud.customInstructions) setCustomInstructions(cloud.customInstructions);
        if (cloud.selectedListingId) setSelectedListingId(cloud.selectedListingId);
        if (Array.isArray(cloud.attachments) && cloud.attachments.length) setAttachments(cloud.attachments);
        if (cloud.logId) setLogId(cloud.logId);
        if (cloud.firstComment) setFirstComment(cloud.firstComment);
        if (typeof cloud.firstCommentEnabled === 'boolean') setFirstCommentEnabled(cloud.firstCommentEnabled);
        if (typeof cloud.attachWaLink === 'boolean') setAttachWaLink(cloud.attachWaLink);
        if (typeof cloud.attachMsngrLink === 'boolean') setAttachMsngrLink(cloud.attachMsngrLink);
        if (cloud.scheduledLocal) {
          setScheduledLocal(String(cloud.scheduledLocal));
          setMode('scheduled');
        }
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, instanceId, deepLinkListingId]);



  // Manual draft save only — nothing is written to ai_content_logs in the
  // background any more. The user must press "שמור טיוטה".
  const saveDraftNow = async () => {
    if (!body.trim() && attachments.length === 0) {
      toast.info('אין תוכן לשמירה');
      return;
    }
    setSaveState('saving');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaveState('idle'); return; }
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
      toast.success('הטיוטה נשמרה');
    } catch (e) {
      console.warn('[CampaignCenter] draft save failed', e);
      setSaveState('idle');
      toast.error('שמירת הטיוטה נכשלה');
    }
  };

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

  // The full listing list is only loaded when the picker opens, so a deep-linked
  // draft fetches its own row. That way the card title shows the REAL property
  // (type + address) instead of a generic placeholder.
  const [soloListing, setSoloListing] = useState<CampaignListing | null>(null);
  useEffect(() => {
    if (!selectedListingId) { setSoloListing(null); return; }
    if (listings.some((l) => l.id === selectedListingId)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, property_title, description, city, neighborhood, address, rooms, sqm, floor, asking_price, features, source_metadata, media_photos, status, is_published, created_at')
        .eq('id', selectedListingId)
        .maybeSingle();
      if (!cancelled && data) setSoloListing(data as unknown as CampaignListing);
    })();
    return () => { cancelled = true; };
  }, [selectedListingId, listings]);

  const selectedListing = listings.find((l) => l.id === selectedListingId)
    || (soloListing && soloListing.id === selectedListingId ? soloListing : null)
    || (selectedListingId ? { id: selectedListingId, property_title: null, description: null, city: null, neighborhood: null, address: null, rooms: null, sqm: null, floor: null, asking_price: null, features: null, source_metadata: null, media_photos: null, status: null, is_published: null, created_at: null } as CampaignListing : null);


  // Always attach up to 10 RANDOM photos of the promoted property — covers
  // deep-links / calendar fan-out / restored drafts, not just manual picks.
  // The server pool (listing_photo_pool) also honours the permanent blocklist
  // and borrows the twin listing's gallery when this row has no photos, and the
  // smart vision filter purges logos / photos of people for good.
  const autoPhotoListingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedListingId) return;
    if (autoPhotoListingRef.current === selectedListingId) return;
    let cancelled = false;
    setPhotosLoading(true);
    (async () => {
      const local = listings.find((l) => l.id === selectedListingId) || null;
      let pool: string[] = [];
      try {
        const { data } = await (supabase as any).rpc('listing_photo_pool', {
          _listing_id: selectedListingId,
        });
        pool = (Array.isArray(data) ? data : []).filter(
          (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
        );
      } catch { /* fall back to the locally cached gallery */ }
      if (pool.length === 0) pool = extractListingPhotoUrls(local as CampaignListing | null);
      if (pool.length === 0) {
        try {
          const { data } = await supabase
            .from('listings')
            .select('id, property_title, address, media_photos, source_metadata')
            .eq('id', selectedListingId)
            .maybeSingle();
          if (data) pool = extractListingPhotoUrls(data as unknown as CampaignListing);
        } catch { /* ignore */ }
      }
      // Background cleanup: permanently drop logo-only frames and photos of people.
      requestSmartMediaFilter(selectedListingId);
      const urls = randomImageSet(pool, MAX_POST_IMAGES);
      if (cancelled) return;
      if (urls.length === 0) { setPhotosLoading(false); return; }
      autoPhotoListingRef.current = selectedListingId;
      const label = (local?.property_title || local?.address || 'property') as string;
      setAttachments((curr) => {
        const existing = new Set(curr.map((a) => a.url).filter(Boolean) as string[]);
        const missing = urls.filter((u) => !existing.has(u));
        if (missing.length === 0) return curr;
        const nonImages = curr.filter((a) => a.kind !== 'image');
        const images = curr.filter((a) => a.kind === 'image');
        const added = missing
          .slice(0, Math.max(0, MAX_POST_IMAGES - images.length))
          .map((u, i) => ({ name: `${label}-${images.length + i + 1}.jpg`, kind: 'image' as const, url: u }));
        return [...images, ...added, ...nonImages];
      });
      setPhotosLoading(false);
    })();
    return () => { cancelled = true; setPhotosLoading(false); };
  }, [selectedListingId, listings]);

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


  /**
   * Permanently blocklists an image the broker deleted from the post generator.
   * The key joins `listings.source_metadata.removed_photo_keys`, so no future
   * Yad2 / Homely / Facebook sync (or any other workspace) can resurrect it.
   */
  const blocklistListingImage = async (listingId: string, url: string) => {
    if (!listingId || !url) return;
    try {
      const { data: row, error } = await supabase
        .from('listings').select('media_photos, source_metadata').eq('id', listingId).maybeSingle();
      if (error) throw error;
      const meta = (row?.source_metadata ?? {}) as Record<string, unknown>;
      const before = Array.isArray(row?.media_photos) ? (row.media_photos as unknown[]) : [];
      const keyOf = (p: unknown) =>
        typeof p === 'string' ? p : String((p as any)?.url ?? (p as any)?.src ?? (p as any)?.image_url ?? '');
      const after = before.filter((p) => keyOf(p) !== url);
      const removed = nextBlockedKeys(meta, before.map(keyOf), after.map(keyOf));
      await supabase.from('listings').update({
        media_photos: after as any[],
        source_metadata: { ...meta, photos: after, removed_photo_keys: removed } as any,
      }).eq('id', listingId);
    } catch (e) {
      console.warn('[CampaignCenter] blocklist listing image failed', e);
    }
  };

  // Append user-uploaded campaign images to the selected listing's gallery so
  // they survive beyond the current post and stay available everywhere.
  const appendImagesToListing = async (listingId: string, newUrls: string[]) => {
    if (!listingId || !newUrls.length) return;
    try {
      const { data: row, error } = await supabase.from('listings').select('media_photos').eq('id', listingId).maybeSingle();
      if (error) throw error;
      const existing = Array.isArray(row?.media_photos) ? (row.media_photos as unknown[]) : [];
      const deduped = existing.slice();
      newUrls.forEach((url) => {
        const exists = deduped.some((p) => {
          if (typeof p === 'string') return p === url;
          return (p as any)?.url === url || (p as any)?.src === url || (p as any)?.image_url === url;
        });
        if (!exists) deduped.push({ url, source: 'campaign_composer', created_at: new Date().toISOString() });
      });
      const { error: updErr } = await supabase.from('listings').update({ media_photos: deduped as any[] }).eq('id', listingId);
      if (updErr) throw updErr;
    } catch (e) {
      console.warn('[CampaignCenter] append listing images failed', e);
    }
  };

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
      // Persist uploaded photos to the property gallery immediately so they are
      // never requested again — they show on the property page and in every
      // current/future post of that property.
      if (selectedListingId) {
        const uploadedImageUrls = uploaded
          .filter((u) => u.placeholder.kind === 'image' && u.url && !u.url.startsWith('blob:'))
          .map((u) => u.url as string);
        if (uploadedImageUrls.length) {
          await appendImagesToListing(selectedListingId, uploadedImageUrls);
        }
      }

      // Synchronous persistence: as soon as the public URL is available,
      // write it into the ai_content_logs row so the media stays bound to
      // the record even if the view refreshes before the debounced autosave
      // fires.
      try {
        const durableMedia = nextAttachments
          .filter((a) => a.url && !a.url.startsWith('blob:'))
          .map((a) => ({ name: a.name, kind: a.kind, url: a.url }));
        // Only refresh an EXISTING manually saved draft — never create one.
        if (logId) {
          await supabase.from('ai_content_logs')
            .update({ media_urls: durableMedia, updated_at: new Date().toISOString() })
            .eq('id', logId);
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

    if (isGenerationStopped()) { toast.info('יצירת התוכן עצורה. לחץ "המשך יצירה" כדי להפעיל מחדש.'); return; }
    const ctrl = registerGeneration();
    setGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { purpose: 'image', prompt, brand: brandName, language: 'he' },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return; // killed by the operator
      if (error) throw error;
      const url = data?.url || data?.image_url;
      if (url) {
        setAttachments((a) => [...a, { name: 'AI Image', kind: 'image', url }]);
        if (selectedListingId) void appendImagesToListing(selectedListingId, [url]);
        toast.success('תמונה נוצרה');

      } else toast.info('לא התקבלה תמונה מה-AI');
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') return;
      toast.error('יצירת תמונה נכשלה');
    }
    finally { releaseGeneration(ctrl); setGeneratingImage(false); }
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

  // ---- Per-property generated content cache -------------------------------
  // Content generated for a property is remembered so revisiting it loads
  // instantly without spending tokens. Regeneration is always allowed.
  const listingCacheKey = (id: string) => `rz_post_cache:${channel.id}:${id}`;
  const readListingCache = (id: string): { body: string; firstComment: string } | null => {
    try {
      const raw = localStorage.getItem(listingCacheKey(id));
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v && typeof v.body === 'string' ? { body: v.body, firstComment: String(v.firstComment || '') } : null;
    } catch { return null; }
  };
  const writeListingCache = (id: string, v: { body: string; firstComment: string }) => {
    try { localStorage.setItem(listingCacheKey(id), JSON.stringify(v)); } catch {}
  };
  const listingAutoGenRef = useRef<string | null>(null);

  const handleGenerate = async (opts?: { rotateTemplate?: boolean }) => {
    if (isGenerationStopped()) { toast.info('יצירת התוכן עצורה. לחץ "המשך יצירה" כדי להפעיל מחדש.'); return; }
    // Registered so the emergency stop can abort this request mid-flight.
    const ctrl = registerGeneration();
    setGenerating(true);
    try {
      const topic = body.trim()
        || customInstructions.trim()
        || (listingHeadline(selectedListing) ? `פוסט קידום: ${listingHeadline(selectedListing)}` : 'פוסט שיווקי');
      const rotateNote = opts?.rotateTemplate
        ? 'בחר תבנית שונה לחלוטין מהפעם הקודמת מתוך מאגר הידע (KB) של תבניות הפוסטים. גוון בין התבניות הקיימות במאגר הידע של החשבון. שמור על דיוק עובדתי מלא לפי נתוני הנכס, טון מקצועי בכיר וקריאה לפעולה חדה לוואטסאפ/טלפון. אל תחזור על אותו פתיח, אותה מבנה או אותו ניסוח CTA כמו בגרסה הקודמת.'
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
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return; // killed by the operator
      if (error) throw error;
      const text = cleanBody(data?.content || data?.text || '').toString();
      if (text) {
        setBody(text);
        setBodyManuallyEdited(false);
        setOriginalAiBody(text);
        // Flush immediately (local + cloud). A refresh in the middle of a bulk
        // generation must never lose an already-generated draft.
        try {
          const prev = readDraft() || {};
          const snapshot = { ...prev, body: text, customInstructions, selectedListingId, attachments, firstComment, firstCommentEnabled, attachWaLink, attachMsngrLink };
          localStorage.setItem(draftKey, JSON.stringify(snapshot));
          void saveComposerDraftCloud(channel.id, instanceId ?? 'single', snapshot);
        } catch {}

        // No DB draft row is created here — drafts are saved only when the
        // operator presses "שמור טיוטה".
      } else toast.info('לא התקבל טקסט');
      // Auto-generate a first comment in the workspace owner's style.
      if (text && !ctrl.signal.aborted && !isGenerationStopped()) {
        void handleGenerateFirstComment(text);
      }
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') return; // silent kill
      toast.error('יצירת טקסט נכשלה');
    } finally {
      releaseGeneration(ctrl);
      setGenerating(false);
    }
  };

  // Generate a Hebrew "first comment" in the workspace owner's warm, first-person tone.
  // Called automatically right after the main post is generated, and manually
  // via the refresh button on the first-comment textarea.
  const handleGenerateFirstComment = async (postBody?: string) => {
    if (isGenerationStopped()) return;
    const ctrl = registerGeneration();
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
            sanitizeSqm(listing.sqm) ? `שטח: ${sanitizeSqm(listing.sqm)} מ"ר` : null,
            sanitizeFloor(listing.floor) !== null ? `קומה: ${sanitizeFloor(listing.floor)}` : null,
            floorsInBuildingFromSqm(listing.sqm) ? `קומות בבניין: ${floorsInBuildingFromSqm(listing.sqm)}` : null,
            listing.asking_price ? `מחיר: ${Number(listing.asking_price).toLocaleString('he-IL')} ש"ח` : null,
          ].filter(Boolean).join(' | ')
        : '';
      const styleInstructions = [
        'כתוב את התגובה הראשונה (First Comment) לפוסט נדל"ן — פורמט קצר וקפדני של שתי שורות בלבד.',
        'מבנה מחייב, בדיוק שתי שורות ותו לא:',
        'שורה 1: משפט אחד ישיר ופשוט על הנכס, מקסימום 10 מילים בסך הכל. בלי מילות מילוי, בלי הקדמות, בלי אימוג\'ים, בלי בולטים, בלי סוגריים מרובעים.',
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
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (error) throw error;
      let text = cleanFirstComment(String(data?.content || data?.text || ''));
      // Enforce strict 2-line layout: a single property line capped at 10
      // words, immediately followed by the canonical keyword line.
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const firstSentence = limitToTenWords(lines.find((l) => !l.includes('|')) || lines[0] || '');
      const finalText = firstSentence && keywordLine
        ? `${firstSentence}\n${keywordLine}`
        : buildFallbackFirstComment(listing as CampaignListing | null);
      if (finalText) {
        // Keep any CTA link lines the user toggled on (WA / Messenger) — a
        // regeneration must never silently strip them.
        const keepLines = [waInjectedRef.current, msngrInjectedRef.current].filter(Boolean) as string[];
        setFirstComment(keepLines.length ? `${finalText}\n\n${keepLines.join('\n\n')}` : finalText);
      }

    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') return; // killed
      toast.error('יצירת תגובה ראשונה נכשלה');
    } finally {
      releaseGeneration(ctrl);
      setFirstCommentGenerating(false);
    }
  };

  // Selecting a property: restore its cached post + first comment instantly,
  // otherwise generate both right away (only when nothing exists yet).
  useEffect(() => {
    if (!hydrated) return;
    const id = selectedListingId;
    if (!id) return;
    if (listingAutoGenRef.current === id) return;
    listingAutoGenRef.current = id;
    const cached = readListingCache(id);
    if (cached && cached.body.trim()) {
      if (!body.trim()) {
        setBody(cached.body);
        setOriginalAiBody(cached.body);
        setBodyManuallyEdited(false);
        if (cached.firstComment.trim() && !firstComment.trim()) setFirstComment(cached.firstComment);
      }
      return;
    }
    if (body.trim() || generating) return;
    const t = setTimeout(() => {
      if (isGenerationStopped()) return;
      if (body.trim() || generating) return;
      autoGenTriggeredRef.current = true;
      handleGenerate().catch(() => {});
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListingId, hydrated]);

  // Keep the per-property cache fresh (debounced) so the next visit is instant.
  useEffect(() => {
    if (!selectedListingId) return;
    if (!body.trim()) return;
    const t = setTimeout(() => writeListingCache(selectedListingId, { body, firstComment }), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListingId, body, firstComment]);




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

  // Hard de-dup: a first comment must never contain more than one WhatsApp /
  // Messenger link, even after regeneration, draft restore or re-toggle.
  const stripAllWaLinkLines = () => {
    setFirstComment((curr) => (curr || '')
      .replace(/\n*[^\n]*(?:wa\.me\/\d+|whatsapp:\/\/send|realtyz\.co\.il\/r\/[A-Za-z0-9]+)[^\n]*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, ''));
  };
  const stripAllMsngrLinkLines = () => {
    setFirstComment((curr) => (curr || '')
      .replace(/\n*[^\n]*m\.me\/[^\s\n]*[^\n]*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, ''));
  };


  // When WA link is toggled ON, mint a branded shortlink and inject a CTA
  // line into the first-comment textarea with a random intro phrase.
  useEffect(() => {
    if (!attachWaLink) {
      stripAllWaLinkLines();
      waInjectedRef.current = '';
      setWaShortUrl('');
      return;
    }

    let cancelled = false;
    (async () => {
      // Fallback CTA must always target the official Meta WhatsApp Business
      // number (never Green API / a personal number).
      let officialPhone = '972537983832';
      try {
        const { data: wap } = await supabase
          .from('wa_providers' as never)
          .select('config')
          .eq('is_official', true)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        const cfg = ((wap as any)?.config ?? {}) as Record<string, unknown>;
        const digits = String(cfg.display_phone_number ?? cfg.phone_number ?? '').replace(/\D/g, '');
        if (digits.length >= 9) officialPhone = digits;
      } catch { /* keep fallback */ }
      // Native app deep link — opens the installed WhatsApp instantly instead
      // of the "download WhatsApp" web page.
      let url = nativeWaLink(officialPhone);
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
      stripAllWaLinkLines();
      waInjectedRef.current = line;

      injectFirstCommentLine(line);
      // The post itself must always carry a way to reach us on WhatsApp.
      setBody((curr) => {
        const text = (curr || '');
        if (/wa\.me\/\d+|whatsapp:\/\/send|realtyz\.co\.il\/r\/[A-Za-z0-9]+/i.test(text)) return text;
        const trimmed = text.replace(/\s+$/, '');
        return trimmed ? `${trimmed}\n\n${line}` : line;
      });

    })();
    return () => { cancelled = true; };
  }, [attachWaLink, selectedListingId]);

  // Messenger deep-link uses the connected FB Page ref.
  useEffect(() => {
    if (!attachMsngrLink) {
      stripAllMsngrLinkLines();
      msngrInjectedRef.current = '';
      setMsngrShortUrl('');
      return;
    }
    const pageRef = socialProfiles.find((p) => p.platform === 'facebook')?.accountRef;
    const url = pageRef ? `https://m.me/${pageRef}` : 'https://m.me/';
    setMsngrShortUrl(url);
    const line = `${pickRandom(MSNGR_INTRO_PHRASES)}: ${url}`;
    stripAllMsngrLinkLines();
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
    // Never regenerate over restored work: wait for hydration to finish first.
    if (!hydrated) return;
    if (body.trim().length > 0) return; // honor draft restoration
    // Emergency stop: the operator halted bulk generation. Already generated
    // drafts stay as-is; nothing new is requested (no tokens spent).
    if (isGenerationStopped()) return;
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
  }, [presetListingId, presetScheduleIso, selectedListingId, listingsLoading, hydrated]);

  // Safety net: if the listing snapshot never resolved (listing missing from the
  // loaded page, slow fetch, ...) the effect above can stay parked and the draft
  // would remain empty forever. Fire generation anyway shortly after hydration.
  useEffect(() => {
    if (!hydrated) return;
    if (autoGenTriggeredRef.current) return;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasContext = !!presetScheduleIso || !!presetListingId || !!params?.get('schedule')
      || !!params?.get('listing') || !!(params?.get('properties') || '').trim();
    if (!hasContext) return;
    const t = setTimeout(() => {
      if (autoGenTriggeredRef.current) return;
      if (isGenerationStopped()) return;
      if (body.trim().length > 0 || generating) return;
      autoGenTriggeredRef.current = true;
      handleGenerate().catch(() => {});
    }, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, presetListingId, presetScheduleIso]);


  // True when this composer was launched from the scheduling calendar
  // (the date is already locked in); we hide the standalone calendar
  // toggle button in that case so the operator doesn't re-pick a date.
  const isFromScheduling = !!presetScheduleIso;

  const hasBody = body.trim().length > 0;
  const count = body.length;

  // Mirror this draft's live status onto its collapsed wrapper card.
  const activeListing = useMemo(
    () => listings.find((l) => l.id === selectedListingId) || null,
    [listings, selectedListingId],
  );
  const imageCount = attachments.filter((a) => a.kind === 'image').length;
  // Shared publish action — used by the sticky button inside the composer,
  // by the collapsed draft card header, and by "publish all drafts".
  const scheduledDateNow = scheduledLocal ? new Date(scheduledLocal) : null;
  const scheduledValidNow = mode === 'now' || (!!scheduledDateNow && scheduledDateNow.getTime() > Date.now());
  const hasSelectedPagesNow = channel.id !== 'facebook' || platformProfiles.length === 0 || selectedProfileIds.length > 0;
  const canPublish = hasBody && scheduledValidNow && hasSelectedPagesNow;

  const submitDraft = useCallback((): boolean => {
    const sd = scheduledLocal ? new Date(scheduledLocal) : null;
    const valid = mode === 'now' || (!!sd && sd.getTime() > Date.now());
    const pagesOk = channel.id !== 'facebook' || platformProfiles.length === 0 || selectedProfileIds.length > 0;
    if (!body.trim() || !valid || !pagesOk) return false;
    // Never lose the picked groups: fall back to the shared per-workspace store
    // so a scheduled/instant post can never be saved as "לא נבחרו קבוצות".
    const effectiveGroupIds = groupIds.length > 0
      ? groupIds
      : loadCampaignGroups(workspaceOwnerId);
    onConfirm({
      body,
      original_ai_body: originalAiBody,
      listing_id: selectedListingId || null,
      mode,
      media_urls: attachments
        .filter((a) => a.kind === 'image' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url))
        .map((a) => a.url as string),
      scheduled_at: mode === 'scheduled' && sd ? sd.toISOString() : null,
      group_ids: channel.id === 'facebook' ? effectiveGroupIds : [],
      publish_to_page: channel.id === 'facebook' ? publishToPage : true,
      selected_profile_ids: channel.id === 'facebook' ? selectedProfileIds : [],
      attach_wa_link: attachWaLink,
      first_comment: firstCommentEnabled ? firstComment : '',
      first_comment_enabled: firstCommentEnabled,
      attach_msngr_link: attachMsngrLink,
    });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, originalAiBody, selectedListingId, mode, attachments, scheduledLocal, groupIds, publishToPage, workspaceOwnerId, selectedProfileIds, attachWaLink, firstComment, firstCommentEnabled, attachMsngrLink, channel.id, platformProfiles.length]);

  useEffect(() => {
    onRegisterPublish?.(submitDraft);
    return () => onRegisterPublish?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitDraft]);

  useEffect(() => {
    onStatus?.({
      title: (listingHeadline(activeListing) || activeListing?.property_title || activeListing?.address || '') as string,
      generating: generating || firstCommentGenerating,
      photosLoading,
      images: imageCount,
      chars: count,
      ready: hasBody && imageCount > 0,
      canPublish,
      thumb: attachments.find((a) => a.kind === 'image' && typeof a.url === 'string' && /^https?:\/\//i.test(a.url))?.url ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListing, generating, firstCommentGenerating, photosLoading, imageCount, count, hasBody, canPublish, attachments]);


  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 pb-44 shadow-sm space-y-4" dir="rtl">
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
                    : 'ללא קידום נכס ספציפי (פוסט כללי)'}
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
                    {[l.property_title, l.neighborhood, l.rooms ? `${l.rooms} חד׳` : null, sanitizeSqm(l.sqm) ? `${sanitizeSqm(l.sqm)} מ״ר` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}

              {/* Cross-source search: pull matching properties from Homely / Yad-2 */}
              <div className="mt-2 border-t border-border/60 pt-2 space-y-2">
                <button
                  type="button"
                  disabled={externalSearching || !listingQuery.trim()}
                  onClick={async () => {
                    setExternalSearching(true);
                    try {
                      const resp = await searchAllSources({ q: listingQuery.trim() || undefined, listing_type: 'all' });
                      setExternalResults(resp.results.filter((r) => r.source !== 'mine').slice(0, 20));
                      if (!resp.results.some((r) => r.source !== 'mine')) toast.info('לא נמצאו נכסים במקורות חיצוניים');
                    } catch (err: any) {
                      toast.error('חיפוש חיצוני נכשל: ' + (err?.message ?? 'שגיאה'));
                    } finally {
                      setExternalSearching(false);
                    }
                  }}
                  className="w-full rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-right text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {externalSearching ? 'מחפש בכל המקורות…' : 'חפש בכל המקורות (הומלי, יד-2, ווב-טיב)'}
                </button>
                {externalResults.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    disabled={importingExternalKey === r.key}
                    onClick={async () => {
                      setImportingExternalKey(r.key);
                      try {
                        const id = await autoImportResult(r);
                        toast.success('הנכס יובא למאגר');
                        // Force local listings refresh so the newly imported row shows up
                        setListings((prev) => prev);
                        setSelectedListingId(id);
                        setBody(''); setFirstComment(''); setBodyManuallyEdited(false);
                        setOriginalAiBody('');
                        waInjectedRef.current = '';
                        msngrInjectedRef.current = '';
                        setAttachWaLink(false); setAttachMsngrLink(false);
                        if (r.photos.length) {
                          setAttachments(r.photos.slice(0, 10).map((u, i) => ({ name: `import-${i + 1}.jpg`, kind: 'image' as const, url: u })));
                        } else {
                          setAttachments([]);
                        }
                        setListingPickerOpen(false);
                      } catch (err: any) {
                        toast.error('ייבוא נכשל: ' + (err?.message ?? 'שגיאה'));
                      } finally {
                        setImportingExternalKey(null);
                      }
                    }}
                    className="w-full rounded-md border border-border px-3 py-2 text-right text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.title}</span>
                      <SourceBadge source={r.source} compact />
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[r.city, r.rooms ? `${r.rooms} חד׳` : null, r.size_sqm ? `${r.size_sqm} מ״ר` : null, r.price ? `₪${r.price.toLocaleString('he-IL')}` : null]
                        .filter(Boolean).join(' · ')}
                      {importingExternalKey === r.key ? ' · מייבא…' : ''}
                    </div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Textarea: icon-only AI generate/regenerate button pinned to the top-right
          (RTL start) corner INSIDE the textarea. When body is empty it kicks off
          the initial generation; when body exists it either finalizes user edits
          or rotates the template. */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          rows={6}
          value={body}
          onChange={(e) => {
            // Store the raw keystrokes verbatim. Normalizing here (trim/clean)
            // rewrites the value mid-typing, which forces the caret to the end
            // of the textarea on every character in Hebrew and English alike.
            setBody(e.target.value);
            setBodyManuallyEdited(true);
          }}
          onBlur={(e) => {
            const cleaned = cleanBody(e.target.value.replace(/^[\s\u200f\u200e]+/g, ''));
            if (cleaned !== e.target.value) setBody(cleaned);
          }}
          placeholder="תוכן הפוסט"
          className="resize-y text-right placeholder:text-muted-foreground/60 placeholder:font-medium pt-1.5 pb-10 pl-12"
        />
        <button
          type="button"
          onClick={() => {
            if (!hasBody) return handleGenerate();
            return bodyManuallyEdited ? finalizeBody() : handleGenerate({ rotateTemplate: true });
          }}
          disabled={generating || finalizingBody}
          className="absolute top-2 left-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label={!hasBody ? 'חולל תוכן עם AI' : (bodyManuallyEdited ? 'שיוף לגרסה סופית' : 'חולל טקסט מחדש')}
          title={!hasBody ? 'חולל תוכן עם AI' : (bodyManuallyEdited ? 'שיוף לגרסה סופית' : 'חולל טקסט מחדש')}
        >
          <RefreshCw className={cn('h-4 w-4', (generating || finalizingBody) && 'animate-spin')} />
        </button>
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
          {photosLoading && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              מייבא תמונות הנכס…
            </span>
          )}
          {attachments.length > 0 && (
            <div className="relative flex items-center gap-1 flex-nowrap flex-1 min-w-0 overflow-x-auto">
              {attachments.map((att, i) => {
                const isVideo = !!att.url && (/\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(att.url) || /^video\//i.test((att as any).mimeType || ''));
                const isImage = att.kind === 'image' && !!att.url && !isVideo;
                // The FIRST thumbnail is always the main cover image of the post
                // and is rendered 15% larger so it is visually unmistakable.
                const isCover = i === 0;
                const box = isCover ? 'h-[36px] w-[36px]' : 'h-[31px] w-[31px]';
                const reorder = (from: number, to: number) => {
                  if (from === to || Number.isNaN(from)) return;
                  setAttachments((curr) => {
                    const next = [...curr];
                    const [moved] = next.splice(from, 1);
                    if (!moved) return curr;
                    next.splice(to, 0, moved);
                    return next;
                  });
                };
                return (
                  <div
                    key={i}
                    className={cn('relative shrink-0 cursor-grab active:cursor-grabbing', isCover && 'z-10')}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => { e.preventDefault(); reorder(Number(e.dataTransfer.getData('text/plain')), i); }}
                    title={isCover ? 'תמונה ראשית — גרור תמונה לכאן כדי להחליף' : 'גרור לשינוי סדר'}
                  >
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(att.url!)}
                        className={cn(
                          'block overflow-hidden rounded-none bg-muted focus:outline-none focus:ring-1 focus:ring-primary',
                          box,
                          isCover ? 'border-2 border-primary' : 'border border-border',
                        )}
                        aria-label={isCover ? 'תמונה ראשית' : 'פתח תמונה'}
                      >
                        <img src={att.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : isVideo ? (
                      <video src={att.url} className={cn('rounded-none object-cover bg-black', box)} muted playsInline />
                    ) : (
                      <div className={cn('flex items-center justify-center rounded-none border border-border bg-muted', box)}>
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

      {/* Publish targets: the business Page is checked by default; groups are
          picked from the group button in the bottom bar. */}
      {channel.id === 'facebook' && (
        <div className="rounded-xl border border-border bg-muted/20 px-3 py-2" dir="rtl">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground select-none cursor-pointer">
            <Checkbox
              checked={publishToPage}
              onCheckedChange={(v) => setPublishToPage(v === true)}
              aria-label="פרסם גם בעמוד הפייסבוק העסקי"
            />
            <span>פרסם גם בעמוד הפייסבוק העסקי</span>
          </label>
        </div>
      )}

      {/* First-comment composer — always visible below the main textarea.
          When enabled (checkbox on), the Meta API posts this text as the first
          comment on the published post. WA / Messenger link options live
          here and no longer touch the main post body. */}
      <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2" dir="rtl">
        <div className="flex flex-row-reverse items-center justify-between gap-2">
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
        // Calendar-initiated flow: always keep the secondary schedule button
        // visible so the user can update the slot before publishing.
        const calendarLocked = isFromScheduling && !!scheduledDate;
        const scheduledLabel = scheduledDate
          ? scheduledDate.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '';
        if (hideBottomBar) return null;
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 px-4 sm:px-5 pb-0 pt-2 backdrop-blur">

            <div className="flex flex-row-reverse items-stretch justify-between gap-2">
              <button
                type="button"
                onClick={() => { submitDraft(); }}
                disabled={!canSend}
                className={cn(
                  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition',
                  canSend
                    ? 'bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)] shadow-md'
                    : 'bg-muted text-muted-foreground/80 cursor-not-allowed',
                )}
              >
                <Megaphone className="h-4 w-4" />
                {calendarLocked ? `פרסם ב-${scheduledLabel}` : (mode === 'scheduled' ? 'פרסם בזמן שנבחר' : 'פרסם עכשיו')}
              </button>
              <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => { void saveDraftNow(); }}
                disabled={!hasBody || saveState === 'saving'}
                title="שמור טיוטה"
                aria-label="שמור טיוטה"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition',
                  hasBody
                    ? 'bg-card text-[hsl(217,80%,18%)] border-[hsl(217,80%,18%)]/30 hover:bg-[hsl(217,80%,18%)]/5 shadow-sm'
                    : 'bg-muted text-muted-foreground/80 border-transparent cursor-not-allowed',
                )}
              >
                {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setScheduleDialogOpen(true)}
                disabled={!hasBody}
                title={recurrenceBubble ? `תזמון פרסום · חזרתיות: ${recurrenceBubble}` : 'תזמן פרסום (כולל חזרות)'}
                aria-label="תזמן פרסום כולל חזרות"
                className={cn(
                  'relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition border',
                  hasBody
                    ? 'bg-card text-[hsl(217,80%,18%)] border-[hsl(217,80%,18%)]/30 hover:bg-[hsl(217,80%,18%)]/5 shadow-sm'
                    : 'bg-muted text-muted-foreground/80 border-transparent cursor-not-allowed',
                  recurrenceBubble && hasBody && 'border-[hsl(217,80%,18%)]/60',
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                {recurrenceBubble && (
                  <span className="absolute -top-2 -right-1 rounded-full bg-[hsl(217,80%,18%)] px-1.5 text-[10px] font-bold leading-[16px] text-white shadow">
                    {recurrenceBubble}
                  </span>
                )}
              </button>
              {channel.id === 'facebook' && (
                <button
                  type="button"
                  onClick={() => setGroupPickerOpen(true)}
                  title="בחירת קבוצות לפרסום"
                  aria-label="בחירת קבוצות לפרסום"
                  className="relative inline-flex items-center justify-center rounded-xl border border-[hsl(217,80%,18%)]/30 bg-card px-4 py-3 text-[hsl(217,80%,18%)] shadow-sm transition hover:bg-[hsl(217,80%,18%)]/5"
                >
                  <Users className="h-4 w-4" />
                  {groupIds.length > 0 && (
                    <span className="absolute -top-1 -left-1 min-w-[18px] rounded-full bg-[hsl(217,80%,18%)] px-1 text-[10px] font-bold leading-[18px] text-white" dir="ltr">
                      {groupIds.length}
                    </span>
                  )}
                </button>
              )}
              </div>
            </div>
          </div>


        );
      })()}


      {/* Facebook groups picker — opened from the group icon button */}
      <Dialog open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
        <DialogContent dir="rtl" className="w-[96vw] sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="text-right">קבוצות לפרסום</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <CampaignGroupSelector selectedIds={groupIds} onChange={setGroupIds} />
            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 cursor-pointer">
              <Checkbox checked={groupTextVariation} onCheckedChange={(v) => setGroupTextVariation(v === true)} />
              <span className="text-sm font-semibold text-foreground">שינוי טקסט לקבוצות</span>
            </label>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" className="w-auto" onClick={() => setGroupPickerOpen(false)}>
              אישור{groupIds.length > 0 ? ` (${groupIds.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
                      const removedUrl = previewImageUrl;
                      setAttachments((a) => a.filter((att) => att.url !== previewImageUrl));
                      setPreviewImageUrl(nextUrl);
                      // Deletion is permanent and global — never comes back.
                      if (selectedListingId && removedUrl) void blocklistListingImage(selectedListingId, removedUrl);
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
        publishToPage={channel.id !== 'facebook' || publishToPage}
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
  open, onClose, channel, body, originalAiBody, listingId, brandName, mediaUrls, scheduledAt, groupIds: groupIdsProp, publishToPage = true, selectedProfileIds, attachWaLink, firstComment, onConfirmed, autoConfirm = false,

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
  publishToPage?: boolean;
  selectedProfileIds: string[];
  attachWaLink: boolean;
  firstComment: string;
  onConfirmed: () => void;
  /** Bulk mode: dispatch immediately, with no confirmation UI at all. */
  autoConfirm?: boolean;
}) => {

  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [pages, setPages] = useState<SocialAccountProfile[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  // Groups are editable right here in the confirmation step: clicking the count
  // opens the picker so targets can be added / removed before broadcasting.
  const [groupIds, setGroupIds] = useState<string[]>(groupIdsProp);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  useEffect(() => {
    if (open) setGroupIds(groupIdsProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupIdsProp.join(',')]);
  const firstBroadcastLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString('he-IL', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : new Date().toLocaleString('he-IL', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });


  // Pre-send statistics for the selected Facebook groups (count + reach).
  const [groupStats, setGroupStats] = useState<{ known: number; members: number }>({ known: 0, members: 0 });
  useEffect(() => {
    if (!open || !groupIds?.length) { setGroupStats({ known: 0, members: 0 }); return; }
    (async () => {
      const ids = Array.from(new Set(groupIds.flatMap((g) => {
        const id = String(g);
        const bare = id.replace(/^ext:/, '');
        return [id, bare, `ext:${bare}`];
      })));
      try {
        const { data } = await (supabase as any)
          .from('fb_user_groups')
          .select('group_id, member_count')
          .in('group_id', ids);
        const rows = (data || []) as any[];
        const members = rows.reduce((sum, r) => sum + (Number(r?.member_count) || 0), 0);
        setGroupStats({ known: rows.filter((r) => Number(r?.member_count) > 0).length, members });
      } catch {
        setGroupStats({ known: 0, members: 0 });
      }
    })();
  }, [open, groupIds]);

  // ── Silent bulk dispatch ───────────────────────────────────────────────
  // In bulk mode the dialog renders nothing and fires the broadcast itself as
  // soon as the publishing targets are resolved.
  const autoFiredRef = useRef(false);
  const handleConfirmRef = useRef<null | (() => Promise<void>)>(null);
  useEffect(() => { if (!open) autoFiredRef.current = false; }, [open]);
  useEffect(() => {
    if (!open || !autoConfirm || autoFiredRef.current || pagesLoading) return;
    autoFiredRef.current = true;
    void handleConfirmRef.current?.();
  }, [open, autoConfirm, pagesLoading]);



  useEffect(() => {
    if (!open || !channel || !user) return;
    (async () => {
      setPagesLoading(true);
      try {
        // Direct Meta: the bound Facebook Page (and its linked IG business
        // account) is the single publishing target for this workspace.
        let workspaceFbId = '';
        let workspaceFbName = '';
        if (channel.id === 'facebook' || channel.id === 'instagram') {
          const { data: binding } = await supabase
            .from('messenger_page_bindings')
            .select('page_id, page_name')
            // Workspace-scoped: every member of the active workspace reads the
            // same binding, never their personal one.
            .eq('owner_id', workspaceOwnerId ?? '')
            .limit(1)
            .maybeSingle();
          workspaceFbId = String((binding as any)?.page_id || '').trim();
          workspaceFbName = String((binding as any)?.page_name || '').trim();
          // A cached "Employee" asset is never a publishing identity — drop it
          // so the server resolver overwrites it with the business Page.
          if (isBlockedFbPage(workspaceFbId, workspaceFbName)) {
            workspaceFbId = '';
            workspaceFbName = '';
          }
          // RLS can hide the owner's binding from workspace members — ask the
          // server for the authoritative Page (it also auto-discovers via
          // /me/accounts when no binding row exists yet).
          if (!workspaceFbId) {
            const resolved = await resolveMetaPageViaFunction();
            workspaceFbId = resolved.pageId || '';
            workspaceFbName = workspaceFbName || resolved.pageName || '';
          }

        }

        // `social_connections` column names vary between workspaces, so read
        // the row as-is and map defensively instead of failing the whole query.
        const { data } = await (supabase as any)
          .from('social_connections')
          .select('*')
          .eq('platform', channel.id)
          .order('updated_at', { ascending: false });
        let rows = ((data || []) as any[])
          .filter((r) => r?.is_connected !== false)
          .map((r: any) => ({
            id: r.id,
            platform: r.platform,
            accountRef: r.account_id || r.page_id || workspaceFbId || '',
            profileKey: null as string | null,
            name: workspaceFbName || r.account_name || r.display_name || r.page_name || channel.label,
            username: null as string | null,
            avatar: r.avatar_url || null,
            profileUrl: (r.account_id || workspaceFbId) ? buildAccountUrl(channel.id, r.account_id || workspaceFbId) : null,
          }));
        const seen = new Set<string>();
        rows = rows.filter((p) => {
          const key = `${p.platform}:${p.accountRef || p.profileKey || p.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if ((channel.id === 'facebook' || channel.id === 'instagram') && rows.length === 0) {
          if (workspaceFbId) {
            rows = [{
              id: `workspace-${channel.id}:${workspaceFbId}`,
              platform: channel.id,
              accountRef: workspaceFbId,
              profileKey: null,
              name: workspaceFbName || channel.label,
              username: null,
              avatar: null,
              profileUrl: buildAccountUrl(channel.id, workspaceFbId),
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
      // Normalization happens at dispatch time (never on keystroke) so the
      // caret is never moved while the user types.
      const bodyToPublish = body
        .replace(/^[\s\u200f\u200e]+/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
        // All group targets are published through the Graph API (no browser extension).
        const apiGroupIds = groupIds.filter((id) => !!id).map((id) => id.replace(/^ext:/, ''));
        // "שינוי טקסט לקבוצות" — build one unique phrasing per group so Facebook
        // doesn't filter the fan-out as duplicate content.
        const groupTexts: Record<string, string> = {};
        let variationEnabled = true;
        try { variationEnabled = localStorage.getItem('campaign:groupTextVariation') !== 'false'; } catch { /* noop */ }
        if (!scheduledAt && channel.id === 'facebook' && variationEnabled && apiGroupIds.length > 1) {
          await Promise.all(apiGroupIds.map(async (gid, i) => {
            try {
              const { data, error } = await supabase.functions.invoke('spin-group-post', {
                body: { body: bodyToPublish, group_name: gid, seed: `${Date.now()}-${i}` },
              });
              if (!error && (data as any)?.draft) groupTexts[gid] = String((data as any).draft);
            } catch { /* keep the base text for this group */ }
          }));
        }
        // Group posts never touch Meta's Graph API (App Review blocks group
        // publishing): they are queued locally in localStorage['rzPostQueue']
        // and the Realtyz browser extension posts them from the broker's own
        // Facebook session.
        let queuedGroups = 0;
        if (channel.id === 'facebook' && apiGroupIds.length > 0) {
          // Retry / re-publish: clear stale completed+failed entries (and legacy
          // Meta errors) for this text so the card reflects the fresh queue run.
          resetQueueEntriesForText(bodyToPublish);
          queuedGroups = enqueueExtensionPosts({
            text: bodyToPublish,
            texts: groupTexts,
            images: mediaUrls,
            link: null,
            firstComment: firstComment || null,
            scheduledAt: scheduledAt,
            groups: apiGroupIds.map((bare) => ({
              group_id: bare,
              group_name: bare,
              group_url: `https://www.facebook.com/groups/${bare}`,
            })),
          });
          if (queuedGroups > 0) {
            toast.success(
              scheduledAt
                ? `${queuedGroups} פוסטים נוספו לתור הפרסום האוטומטי של התוסף · ${new Date(scheduledAt).toLocaleString('he-IL')}`
                : `${queuedGroups} פוסטים נוספו לתור הפרסום האוטומטי של התוסף בדפדפן`,
            );
          }
        }

        // Nothing left for the backend when only groups were targeted.
        if (queuedGroups > 0 && (publishToPage === false || (channel.id === 'facebook' && publishTargets.length === 0))) {
          // The post must show up in "פורסמו" right away with its queue badge
          // and its group-names pill, so we persist a history row and paint an
          // optimistic card immediately.
          try {
            window.dispatchEvent(new CustomEvent('rz:campaign-optimistic', {
              detail: {
                channel: channel.id,
                body: bodyToPublish,
                media_urls: mediaUrls,
                campaign_name: campaignName,
                group_ids: apiGroupIds,
                scheduled_at: scheduledAt,
              },
            }));
          } catch { /* noop */ }
          try {
            await supabase.from('campaign_logs').insert({
              user_id: ownerScope,
              workspace_owner_id: ownerScope,
              campaign_name: campaignName,
              channel: channel.id,
              message_body: bodyToPublish,
              media_urls: mediaUrls,
              group_ids: apiGroupIds,
              first_comment: firstComment || null,
              // Immediate group posts belong in "פורסמו" straight away with the
              // extension-queue badge; only real future slots are "scheduled".
              status: scheduledAt ? 'scheduled' : 'publishing',
              sent_at: scheduledAt ?? null,
            } as any);
          } catch (err) {
            console.warn('[campaign] group-only history row failed', err);
          }
          onConfirmed();
          onClose();
          return;
        }

        const results = [] as any[];


        for (const target of targets) {
          // Optimistic pill in the sent-posts feed while Meta verifies.
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
          // Hard timeout: a hanging Graph call must never leave the dialog in a
          // silent "nothing happened" state.
          const invocation = supabase.functions.invoke('meta-publish', {
            body: {
              post: bodyToPublish,
              channels: [channel.id],
              campaign_name: target ? `${campaignName} · ${target.name}` : campaignName,
              media_urls: mediaUrls,
              scheduled_at: scheduledAt,
              workspace_owner_id: ownerScope,
              group_ids: [],
              publish_to_page: publishToPage !== false,
              group_texts: groupTexts,

              target_profile_id: target?.id ?? null,
              target_account_ref: target?.accountRef ?? null,
              target_profile_key: target?.profileKey ?? null,
              first_comment: firstComment || null,
            },
          });
          const { data, error } = await Promise.race([
            invocation,
            new Promise<any>((_, reject) =>
              setTimeout(() => reject(new Error('השידור לא הסתיים בזמן (120 שניות). נסה שוב או תזמן לשידור מאוחר יותר.')), 120000)
            ),
          ]);
          console.log('[campaign] meta-publish result', { target: target?.name ?? null, groups: apiGroupIds.length, data, error });
          results.push({ data, error, target });
        }



        // Circuit-breaker short-circuit: the backend is intentionally pausing
        // outbound Meta traffic. Persist a "paused" campaign row so the
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
        // Idempotency: the backend detected the exact same post already live and
        // skipped a second publish (and a second history row).
        const duplicateOnly = !scheduledAt && results.length > 0 &&
          results.every((r) => (r.data as any)?.duplicate === true);

        const reachNote = groupStats.members > 0 ? ` · חשיפה פוטנציאלית ${groupStats.members.toLocaleString('he-IL')} חברים` : '';
        if (scheduledAt) {
          const when = new Date(scheduledAt).toLocaleString('he-IL');
          toast.success(`הפוסט תוזמן ל-${when} · ${targets.length} יעד(ים) · ${Math.max(0, groupIds.length - queuedGroups)} קבוצות${reachNote}`);
        } else if (duplicateOnly) {
          toast.info((results[0]?.data as any)?.message || 'הפוסט הזה כבר פורסם — לא נשלח שוב.');
        } else if (groupIds.length > 0 && queuedGroups === 0 && groupFailures.length === 0) {
          toast.success(`הפוסט שותף בהצלחה ב-${groupIds.length} קבוצות${reachNote}`);
        } else if (groupIds.length > 0 && queuedGroups === 0 && groupFailures.length > 0) {
          toast.error(`פורסם ב-${groupIds.length - groupFailures.length} קבוצות · נכשל ב-${groupFailures.length}`);
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

  handleConfirmRef.current = handleConfirm;
  // Bulk mode: no confirmation UI whatsoever.
  if (autoConfirm) return null;

  return (

    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-lg max-h-[92vh] overflow-y-auto">
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

        {/* Pre-send statistics — exactly what is about to go out and to where. */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-right">
          <div className="mb-2 text-sm font-semibold text-foreground">סטטיסטיקה לפני שידור</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setGroupPickerOpen(true)}
              className="rounded-lg bg-background p-2 text-right transition hover:bg-primary/5 hover:ring-1 hover:ring-primary/40"
              title="לחץ לעריכת רשימת הקבוצות"
            >
              <div className="text-[11px] text-muted-foreground">קבוצות נבחרות (לחץ לעריכה)</div>
              <div className="text-lg font-bold tabular-nums text-primary underline decoration-dotted">{groupIds.length}</div>
            </button>
            <div className="rounded-lg bg-background p-2">
              <div className="text-[11px] text-muted-foreground">חברים בכל הקבוצות</div>
              <div className="text-lg font-bold tabular-nums text-foreground">
                {groupStats.members > 0 ? groupStats.members.toLocaleString('he-IL') : '—'}
              </div>
              {groupIds.length > 0 && groupStats.known < groupIds.length && (
                <div className="text-[10px] text-muted-foreground">נתוני חברים ל-{groupStats.known} מתוך {groupIds.length}</div>
              )}
            </div>
            <div className="rounded-lg bg-background p-2">
              <div className="text-[11px] text-muted-foreground">יעדי עמוד / פרופיל</div>
              <div className="text-lg font-bold tabular-nums text-foreground">{publishTargets.length || 1}</div>
            </div>
            <div className="rounded-lg bg-background p-2">
              <div className="text-[11px] text-muted-foreground">תמונות בפוסט</div>
              <div className="text-lg font-bold tabular-nums text-foreground">{mediaUrls.length}</div>
            </div>
            <div className="rounded-lg bg-background p-2">
              <div className="text-[11px] text-muted-foreground">תגובה ראשונה</div>
              <div className="text-sm font-bold text-foreground">{firstComment?.trim() ? 'כן' : 'לא'}</div>
            </div>
            <div className="rounded-lg bg-background p-2">
              <div className="text-[11px] text-muted-foreground">מועד שידור</div>
              <div className="text-sm font-bold text-foreground">
                {scheduledAt ? new Date(scheduledAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'עכשיו'}
              </div>
            </div>
            <div className="rounded-lg bg-background p-2">
              <div className="text-[11px] text-muted-foreground">השידור הראשון בקמפיין</div>
              <div className="text-sm font-bold text-foreground">{firstBroadcastLabel}</div>
            </div>
          </div>

        </div>

        {/* Inline group editor — rendered in-dialog so the list scrolls freely. */}
        {groupPickerOpen && (
          <div className="rounded-xl border border-border bg-background p-3" dir="rtl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">בחירת קבוצות לשידור</div>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                saveCampaignGroups(workspaceOwnerId, groupIds);
                setGroupPickerOpen(false);
              }}>
                סיום ({groupIds.length})
              </Button>
            </div>
            <div className="max-h-[45vh] overflow-y-auto overscroll-contain">
              <CampaignGroupSelector selectedIds={groupIds} onChange={setGroupIds} />
            </div>
          </div>
        )}






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
  failure_reason?: string | null;
  sent_at?: string | null;

  media_urls?: string[];
  group_ids?: string[];
  external_url?: string | null;
  is_external?: boolean;
  listing_id?: string | null;
};

// A scheduled row is one still waiting in the queue: status "scheduled"/"pending"
// and not yet dispatched. The slot time (sent_at) may already have passed — an
// overdue post is still pending, so it MUST stay visible in "עתידיים" instead of
// silently disappearing. Never infer scheduling purely from the presence of
// sent_at, because real sent posts also stamp sent_at.
export const isScheduledRow = (r: Pick<CampaignRow, 'status' | 'sent_at'>): boolean => {
  const status = String(r.status || '').toLowerCase();
  return status === 'scheduled' || status === 'pending' || status === 'queued';
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

// Derive the live native post URL from the Meta provider response, or build
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

// Cross-reload cache: the last painted feed is mirrored into localStorage so
// re-entering /campaigns (or a hard refresh, or a brand-new tab) renders the
// previous post list instantly and never shows an empty white feed while the
// DB/Meta refresh runs in the background.
const FEED_CACHE_STORAGE_KEY = 'realtyz.campaigns.feed_rows.v1';
const FEED_CACHE_MAX_PERSISTED = 120;

// Remembers that this account has a bound Facebook Page so the card renders
// "מחובר" instantly on mount, before the async DB verification resolves.
const FB_BINDING_FLAG_KEY = 'realtyz.campaigns.fb_page_bound.v1';
const fbBindingFlagKey = (scope?: string | null) => `${FB_BINDING_FLAG_KEY}:${scope || 'signed-out'}`;
const writeFbBindingFlag = (bound: boolean, scope?: string | null) => {
  try {
    const key = fbBindingFlagKey(scope);
    if (bound) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
};

const connectionStorageKey = (base: string, userId?: string | null, workspaceId?: string | null) =>
  `${base}:${userId || 'signed-out'}:${workspaceId || 'self'}`;

const clearCachedFacebookChannel = (scope?: string | null) => {
  try {
    writeFbBindingFlag(false, scope);
  } catch { /* ignore */ }
};

/**
 * Authoritative Facebook Page resolution. The client table read on
 * `messenger_page_bindings` can come back empty for workspace members (RLS
 * scopes rows to the workspace owner), which used to render "לא מחובר" even
 * though a valid Page token is stored. `meta-page-connect` resolves the
 * workspace owner server-side, so we use it as the fallback source of truth.
 */
type ResolvedMetaPage = { pageId: string | null; pageName: string | null; instagram: boolean };

/** Assets that must never be shown or used as the publishing identity. */
const BLOCKED_FB_PAGE_IDS = new Set<string>();
const isBlockedFbPage = (id?: string | null, _name?: string | null) =>
  !!id && BLOCKED_FB_PAGE_IDS.has(String(id));

const resolveMetaPageViaFunction = async (): Promise<ResolvedMetaPage> => {
  const read = async (): Promise<ResolvedMetaPage> => {
    const { data } = await supabase.functions.invoke('meta-page-connect', { body: { action: 'status' } });
    const res = data as any;
    const id = res?.page?.id ? String(res.page.id) : null;
    if ((res?.connected || res?.ok) && id) {
      return { pageId: id, pageName: res.page.name ?? null, instagram: !!res?.instagram?.id };
    }
    return { pageId: null, pageName: null, instagram: false };
  };

  try {
    const first = await read();
    if (isBlockedFbPage(first.pageId, first.pageName)) return { pageId: null, pageName: null, instagram: false };
    return first;
  } catch { /* ignore — caller falls back to the remembered flag */ }
  return { pageId: null, pageName: null, instagram: false };
};




const readPersistedFeedCache = (): Record<string, CampaignRow[]> => {
  try {
    const raw = localStorage.getItem(FEED_CACHE_STORAGE_KEY) || sessionStorage.getItem(FEED_CACHE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, CampaignRow[]> : {};
  } catch { return {}; }
};

const persistFeedCache = (scope: string, rows: CampaignRow[]) => {
  try {
    const all = readPersistedFeedCache();
    all[scope] = rows.slice(0, FEED_CACHE_MAX_PERSISTED);
    localStorage.setItem(FEED_CACHE_STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota — in-memory cache still applies */ }
};

// Warm the in-memory cache from the persisted copy at module load.
try {
  Object.entries(readPersistedFeedCache()).forEach(([scope, rows]) => {
    if (Array.isArray(rows) && rows.length > 0 && !FEED_ROWS_CACHE.has(scope)) {
      FEED_ROWS_CACHE.set(scope, rows);
    }
  });
} catch { /* ignore */ }

type FeedSubTab = 'published' | 'drafts' | 'future';

const PublishedFeed = ({
  subTab = 'published',
  onSubTabChange,
  altContent,
}: {
  subTab?: FeedSubTab;
  onSubTabChange?: (v: FeedSubTab) => void;
  /** Rendered instead of the published list when a non-published tab is active. */
  altContent?: React.ReactNode;
} = {}) => {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const queryClient = useQueryClient();
  const fbGroupMeta = useFbGroupMeta();
  // Live local extension queue — cards flip failed → pending → completed on their own.
  const extensionQueue = useExtensionQueue();
  const initialScopedRows = workspaceOwnerId ? FEED_ROWS_CACHE.get(workspaceOwnerId) ?? null : null;
  const [rows, setRows] = useState<CampaignRow[] | null>(initialScopedRows);
  // True only during the very first cold load (no cache anywhere, in-memory or
  // persisted). The blocking loader is gated on this — a background refresh
  // must never hide already-rendered cached rows.
  const [coldLoading, setColdLoading] = useState<boolean>(() => initialScopedRows === null);
  const [supportChannel, setSupportChannel] = useState<string | null>(null);


  const [userId, setUserId] = useState<string | null>(null);
  const [campaignUserIds, setCampaignUserIds] = useState<string[]>([]);
  const [editRepostRow, setEditRepostRow] = useState<CampaignRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignRow | null>(null);
  // Optimistic rows for immediate publish — prepended to the feed with a
  // countdown pill while Meta finishes verifying the FB publish.
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
        group_ids: Array.isArray(detail.group_ids) ? detail.group_ids.map((g: any) => String(g)) : [],
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
  // gate are bypassed regardless of any persisted `social_circuit_state`.
  const CIRCUIT_OVERRIDE = true;
  const [circuitUntilMs, setCircuitUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (CIRCUIT_OVERRIDE) {
      try {
        sessionStorage.removeItem('realtyz.social_circuit_state');
        localStorage.removeItem('realtyz.social_circuit_state');
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
          .eq('key', 'social_circuit_state')
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
      // Guard: an empty tree must never wipe a badge that already shows real
      // comments — the tree can be empty simply because the provider import
      // has not landed yet.
      if (count === 0 && (prev[campaignId] ?? 0) > 0) return prev;
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
      // Only arm the full provider lock when the refresh actually returned
      // comments. A zero-result run gets a short 60s cooldown so the countdown
      // never traps the user for 15 minutes after a no-op refresh.
      const armed = result.count > 0 ? REFRESH_COOLDOWN_MS : 60_000;
      setCooldownUntil((prev) => ({ ...prev, [campaignId]: Date.now() + armed }));
      setNowTick(Date.now());
      if (result.count > 0) {
        toast.success(`רוענן: ${result.count} תגובות חיות`, { id: `refresh-${campaignId}` });
      } else {
        toast.message('אין תגובות חדשות כרגע', { id: `refresh-${campaignId}` });
      }
    } else {
      // Failed refresh must NOT start a countdown and must NOT touch the badge.
      toast.error(result.error || 'רענון נכשל', { id: `refresh-${campaignId}` });
    }
  };



  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [connectedChannels, setConnectedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleDisconnect = () => {
      clearCachedFacebookChannel(workspaceOwnerId);
      setConnectedChannels((previous) => new Set([...previous].filter((id) => id !== 'facebook')));
    };
    window.addEventListener('realtyz:facebook-disconnected', handleDisconnect);
    return () => window.removeEventListener('realtyz:facebook-disconnected', handleDisconnect);
  }, [workspaceOwnerId]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const next = new Set<string>();
      // A bound Facebook Page (OAuth or manual token) is by itself a valid
      // connected state — the manual path never writes to social_connections.
      try {
        const { data: binding } = await supabase
          .from('messenger_page_bindings')
          .select('page_id')
          .eq('owner_id', workspaceOwnerId ?? '')
          .limit(1)
          .maybeSingle();
        let pageId = ((binding as any)?.page_id as string | null) ?? null;
        if (!pageId) {
          // Fall back to the server-side resolver (workspace-owner scoped).
          pageId = (await resolveMetaPageViaFunction()).pageId;
        }
        if (pageId) {
          next.add('facebook');
          writeFbBindingFlag(true, workspaceOwnerId);
        } else {
          writeFbBindingFlag(false, workspaceOwnerId);
        }
      } catch {
        writeFbBindingFlag(false, workspaceOwnerId);
      }

      const { data } = await supabase
        .from('social_connections')
        .select('platform, is_connected')
        .eq('is_connected', true);
      (data || []).forEach((r: any) => {
        if (!r?.is_connected) return;
        const p = String(r.platform || '').toLowerCase();
        if (p === 'twitter') next.add('x');
        else if (p.startsWith('facebook')) next.add('facebook');
        else next.add(p);
      });
      setConnectedChannels(next);
    })();
  }, [workspaceOwnerId]);

  const handleFeedConnect = async (id: string) => {
    // Channels that still require a managed aggregator account cannot be
    // self-connected — surface the support popup instead of a dead redirect.
    if (!isNativeChannel(id)) {
      setSupportChannel(FEED_PLATFORMS.find((p) => p.id === id)?.label ?? id);
      return;
    }
    if (id !== 'facebook' && id !== 'instagram') {
      window.location.href = '/profile?tab=connections';
      return;
    }
    try {
      toast.loading('פותח חיבור לפייסבוק…', { id: 'meta-connect-feed' });
      const { data, error } = await supabase.functions.invoke('meta-page-connect', {
        body: {
          action: 'start',
          redirect_uri: oauthRedirectUri(),
          return_origin: oauthReturnOrigin(),
        },
      });
      toast.dismiss('meta-connect-feed');
      if (error) throw new Error((error as any)?.message || 'יצירת חיבור נכשלה');
      const url = (data as any)?.auth_url;
      if (!url) { toast.error((data as any)?.error || 'לא התקבל קישור חיבור מ-Meta'); return; }
      if (!openOAuthWindow(String(url))) {
        toast.error('הדפדפן חסם את חלון ההתחברות. אפשרו חלונות קופצים ונסו שוב.');
      }
    } catch (e: any) {
      toast.dismiss('meta-connect-feed');
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

    // DB-first: read the persisted campaign_logs feed BEFORE any Meta
    // import. This is the whole point of the cache — the user should see
    // instantly whatever was previously stored, never waiting on the provider.
    const { data } = await supabase
      .from('campaign_logs')
      .select('id, user_id, campaign_name, channel, message_body, created_at, provider_message_id, provider_response, media_urls, is_archived, like_count, comment_count, share_count, view_count, metrics_updated_at, status, failure_reason, sent_at, group_ids')
      .in('user_id', scopedUserIds)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1000);

    const normalizeStoredRow = (r: any): CampaignRow => {
      const pr = r?.provider_response ?? {};
      // Priority: permanently mirrored copies → the durable column → whatever
      // the provider payload carried (signed FB CDN links that expire).
      const media = dropRemovedMedia(
        mergePostMediaUrls(
          pr?.cached_media_urls,
          r?.media_urls,
          pr?.media_urls,
          pr?.media,
          pr?.raw?.mediaUrls,
          pr?.raw?.fullPicture ? [pr.raw.fullPicture] : null,
        ),
        readRemovedMediaKeys(pr),
      );

      const externalUrl =
        (typeof pr?.external_url === 'string' && pr.external_url) ||
        (Array.isArray(pr?.postIds)
          ? pr.postIds.find((p: any) => String(p?.platform || '').toLowerCase() === String(r?.channel || '').toLowerCase())?.postUrl
          : null) ||
        null;
      return {
        ...r,
        media_urls: media,
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
        existing.media_urls = keepLongestMediaUrls(existing.media_urls, r.media_urls);
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

    // Never wipe a populated feed with an empty read (transient RLS/scope/
    // disconnect blips) — keep the cached list until real rows come back.
    const cachedForScope = FEED_ROWS_CACHE.get(ownerScope);
    if (merged.length === 0 && cachedForScope && cachedForScope.length > 0) {
      setRows(cachedForScope);
      setColdLoading(false);
      return { rows: cachedForScope, ownerScope, importedCount: 0, importComplete: false };
    }
    setRows(merged);
    FEED_ROWS_CACHE.set(ownerScope, merged);
    persistFeedCache(ownerScope, merged);
    setColdLoading(false);
    try { sessionStorage.setItem(CAMPAIGNS_COUNT_SESSION_KEY, String(merged.length)); } catch { /* quota */ }

    // Nudge the sidebar to repaint the campaigns badge with the persisted DB count.
    try { queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] }); } catch { /* no-op */ }

    // Background Meta import — never blocks the DB paint above. Only runs
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
        const connectedPage = await resolveMetaPageViaFunction();
        shouldImport = Boolean(connectedPage.pageId);
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

      // ALWAYS-ON background reconciliation with the native Facebook Page:
      // pulls brand-new native posts, refreshes live engagement counters and
      // removes from our feed anything that was deleted on Facebook itself.
      // Throttled per session so entering the page repeatedly stays cheap.
      if (!shouldImport) {
        const syncKey = `realtyz.fb_native_reconcile.${ownerScope}`;
        let mayReconcile = true;
        try {
          const raw = sessionStorage.getItem(syncKey);
          const at = raw ? Number(raw) : 0;
          mayReconcile = !Number.isFinite(at) || Date.now() - at > 2 * 60_000;
        } catch { mayReconcile = true; }
        if (mayReconcile) {
          try { sessionStorage.setItem(syncKey, String(Date.now())); } catch { /* quota */ }
          void (async () => {
            try {
              const { data } = await supabase.functions.invoke('fb-recent-posts', {
                body: {
                  lastRecords: 100,
                  pageSize: 50,
                  user_id: ownerScope,
                  persist: true,
                  prune_missing: true,
                },
              });
              const removed = Number((data as any)?.pruned_missing) || 0;
              if (removed > 0 || Number((data as any)?.upserted) > 0) {
                // Repaint from the DB (skip a second provider round-trip).
                void load({ skipFbImport: true });
              }
            } catch (err) {
              console.warn('[PublishedFeed] native reconcile failed (non-fatal)', err);
            }
          })();
        }
      }
    }

    return { rows: merged, ownerScope, importedCount: shouldImport ? merged.length : 0, importComplete: merged.length >= EXPECTED_NATIVE_FACEBOOK_POSTS };
  };



  // Ask the backend to (a) refresh live Meta analytics — likes/comments/shares/views
  // land back on campaign_logs and stream in via the realtime subscription below — and
  // (b) pull fresh inbound comments into engagement_events so the per-card comments tree
  // updates without a manual refresh.
  const refreshMetrics = async (ownerOverride?: string | null): Promise<boolean> => {
    const metricsOwner = ownerOverride ?? workspaceOwnerId ?? userId;
    if (!metricsOwner) return false;
    // Force a direct live page fetch every time — bypass any cached counters
    // so the UI mirrors the exact real-time Meta payload.
    const cacheBust = `${Date.now()}-${crypto.randomUUID()}`;
    // Run the comments sync (nested replies + Like reactions) and the
    // headline analytics in parallel — neither blocks the other.
    // RATE-LIMIT HARD RULE: the bulk comments sync (which fanned out to every
    // post in the workspace) is NO LONGER auto-triggered here. It caused the
    // HTTP 429 storm / provider suspension. Comments now arrive via the
    // Meta webhook (realtime) or an explicit per-card refresh click.
    const syncPromise = Promise.resolve(null);


    try {
      const [{ data, error }] = await Promise.all([
        supabase.functions.invoke('meta-insights', {
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
      // meta-comments-sync (parent + every recursive child) lives in
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
    setRows(cached ?? null);
    setColdLoading(!cached);
    let cancelled = false;
    const hydrateAndRefresh = async () => {
      // 1) INSTANT paint from in-memory cache (same-session re-entry).
      if (cached && cached.length > 0) {
        setRows(cached);
        setColdLoading(false);
      }

      // 2) Always run a DB-only read so cross-session re-entries paint
      //    instantly from campaign_logs without waiting on Meta. The
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

  // Background media re-sync: once per browser session per workspace, mirror
  // every Facebook post image into the permanent post-media-cache bucket so
  // the feed never depends on an expiring CDN signature. Fire-and-forget.
  useEffect(() => {
    const scope = workspaceOwnerId ?? userId;
    if (!scope) return;
    const key = `realtyz.fb_media_resync.${scope}`;
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Number.isFinite(last) && Date.now() - last < 6 * 60 * 60 * 1000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch { /* sessionStorage unavailable — still run once */ }
    void supabase.functions
      .invoke('sync-all-facebook-post-images', { body: { limit: 500 } })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceOwnerId, userId]);

  // Live native-Facebook validation of the posts we show: for every Page post
  // and per-group post id we hold, the backend asks the Graph API whether the
  // object still exists and writes back the true state (published / rejected),
  // deleting rows that were removed on Facebook itself. Runs only while the tab
  // is actually visible and is throttled, so nothing polls in the background.
  useEffect(() => {
    const scope = workspaceOwnerId ?? userId;
    if (!scope || !rows || rows.length === 0) return;
    const key = `realtyz.fb_status_sync.${scope}`;
    let cancelled = false;

    const verify = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const last = Number(sessionStorage.getItem(key) || 0);
        if (Number.isFinite(last) && Date.now() - last < 3 * 60_000) return;
        sessionStorage.setItem(key, String(Date.now()));
      } catch { /* sessionStorage unavailable — still run */ }
      const ids = (rows ?? [])
        .filter((r) => String(r.channel || '').toLowerCase() === 'facebook')
        .slice(0, 40)
        .map((r) => r.id);
      if (ids.length === 0) return;
      try {
        const { data } = await supabase.functions.invoke('fb-post-status-sync', { body: { ids } });
        const changed = (Number((data as any)?.deleted) || 0) + (Number((data as any)?.updated) || 0);
        if (changed > 0 && !cancelled) void load({ skipFbImport: true });
      } catch { /* non-fatal: never block the feed on a provider hiccup */ }
    };

    void verify();
    const onVisible = () => { if (document.visibilityState === 'visible') void verify(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceOwnerId, userId, rows?.length]);








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
    const channel = safeChannel(`campaign_logs:${scope}`)
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
              media_urls: dropRemovedMedia(
                keepLongestMediaUrls(
                  dropRemovedMedia(r.media_urls ?? [], readRemovedMediaKeys(updated.provider_response)),
                  mergePostMediaUrls(
                    updated.provider_response?.cached_media_urls,
                    updated.media_urls,
                    updated.provider_response?.media_urls,
                    updated.provider_response?.media,
                  ),
                ),
                readRemovedMediaKeys(updated.provider_response),
              ),

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
                media_urls: mergePostMediaUrls(
                  provider.cached_media_urls,
                  inserted.media_urls,
                  provider.media_urls,
                  provider.media,
                ),
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
    return () => { removeChannelSafe(channel); };
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

  // External (social network) post ids attached to a campaign row.
  const externalIdsFor = (r: CampaignRow) => Array.from(new Set([
    r.provider_message_id,
    ...((r as any).provider_response?.postIds || []).map((p: any) => p?.id ?? p?.postId).filter(Boolean),
  ].filter(Boolean) as string[]));

  // Performs the actual deletion. `mode === 'both'` first wipes the post off
  // the native social network (Meta Graph via meta-publish) and aborts on
  // failure, so we never leave a phantom post live on the broker's Page.
  const performDelete = async (r: CampaignRow, mode: 'db' | 'both') => {
    const externalIds = mode === 'both' ? externalIdsFor(r) : [];

    if (externalIds.length > 0) {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/meta-publish`;
      for (const pid of externalIds) {
        const resp = await fetch(fnUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken ?? ''}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ external_post_id: pid }),
        }).catch((e: any) => {
          throw new Error(`מחיקה מפייסבוק נכשלה: ${e?.message ?? e}`);
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(`מחיקה מפייסבוק נכשלה: ${body?.error ?? resp.status}`);
        }
      }
    }

    // Local cleanup of the campaign_logs group rows.
    const { from, to } = groupFilter(r);
    const { error, count } = await supabase
      .from('campaign_logs')
      .delete({ count: 'exact' })
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .gte('created_at', from)
      .lt('created_at', to);
    if (error) throw new Error('מחיקה מהמערכת נכשלה: ' + error.message);

    setRows((prev) => {
      const next = prev?.filter((x) => x.id !== r.id) ?? prev;
      const scopeKey = workspaceOwnerId ?? userId ?? '';
      if (next && scopeKey) FEED_ROWS_CACHE.set(scopeKey, next);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
    toast.success(
      externalIds.length > 0
        ? `הפוסט נמחק מפייסבוק ומהמערכת${typeof count === 'number' ? ` (${count} רשומות)` : ''}`
        : `הפוסט נמחק מהמערכת${typeof count === 'number' ? ` (${count} רשומות)` : ''}`,
    );
  };

  const deleteCampaign = (r: CampaignRow) => setDeleteTarget(r);


  // Remove a single image from a post — permanently. The URL's dedupe key is
  // added to provider_response.removed_media_keys, which every merge path (and
  // the DB trigger) honours, so no sync can ever bring the image back.
  const removeMediaUrl = async (campaignId: string, removedUrl: string) => {
    const row = rows?.find((r) => r.id === campaignId);
    if (!row || !removedUrl) return;
    const removedKey = mediaDedupeKey(removedUrl);

    const nextMedia = (row.media_urls ?? []).filter((u) => mediaDedupeKey(u) !== removedKey);
    setRows((prev) => prev?.map((r) => (r.id === campaignId ? { ...r, media_urls: nextMedia } : r)) ?? prev);


    try {
      // All DB rows behind this card (a broadcast fans out into many rows).
      let query = supabase.from('campaign_logs').select('id, provider_response, media_urls');
      query = row.provider_message_id
        ? query.eq('provider_message_id', row.provider_message_id)
        : query.eq('id', campaignId);
      const { data: targets } = await query;
      const list = (targets && targets.length > 0) ? targets : [{ id: campaignId, provider_response: {}, media_urls: [] } as any];

      for (const t of list) {
        const pr = (t.provider_response && typeof t.provider_response === 'object') ? { ...(t.provider_response as any) } : {};
        const keys = new Set(readRemovedMediaKeys(pr));
        keys.add(removedKey);
        pr.removed_media_keys = Array.from(keys);
        const strip = (v: unknown) => dropRemovedMedia(normalizePostMediaUrls(v), Array.from(keys));
        if (Array.isArray(pr.media_urls)) pr.media_urls = strip(pr.media_urls);
        if (Array.isArray(pr.cached_media_urls)) pr.cached_media_urls = strip(pr.cached_media_urls);

        const { error } = await supabase
          .from('campaign_logs')
          .update({ provider_response: pr, media_urls: strip(t.media_urls) })
          .eq('id', t.id);
        if (error) throw error;
      }
      toast.success('התמונה הוסרה מהפוסט לצמיתות');
    } catch (err: any) {
      console.error('[remove-media] failed', err);
      toast.error('הסרת התמונה נכשלה');
      setRows((prev) => prev?.map((r) => (r.id === campaignId ? { ...r, media_urls: row.media_urls } : r)) ?? prev);
    }
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
              ? { ...row, media_urls: keepLongestMediaUrls(row.media_urls, media) }
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
    // Group posts live in the browser-extension queue (localStorage), not only
    // in the DB. Synthesize a card per queued post so it shows up immediately
    // in "פורסמו"/"עתידיים" with its status badge and group pills, and updates
    // live as the extension drains the queue.
    const bodyKey = (t: unknown) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const knownBodies = new Set(
      [...optimisticRows, ...base].map((r) => bodyKey(r.message_body)).filter(Boolean),
    );
    const extGroups = new Map<string, {
      text: string;
      images: string[];
      groupIds: string[];
      scheduledTime: number;
      createdAt: number;
      statuses: string[];
    }>();
    for (const e of extensionQueue) {
      const key = `${bodyKey(e.text)}|${Math.floor(Number(e.scheduledTime || 0) / 60000)}`;
      if (!bodyKey(e.text)) continue;
      const gid = String(e.groupUrl || '').match(/groups\/([^/?#]+)/)?.[1] || '';
      const cur = extGroups.get(key) || {
        text: e.text,
        images: Array.isArray(e.images) ? e.images : [],
        groupIds: [] as string[],
        scheduledTime: Number(e.scheduledTime) || Date.now(),
        createdAt: Number(e.createdAt) || Date.now(),
        statuses: [] as string[],
      };
      if (gid && !cur.groupIds.includes(gid)) cur.groupIds.push(gid);
      cur.statuses.push(String(e.status || 'pending'));
      extGroups.set(key, cur);
    }
    const extRows: CampaignRow[] = [];
    for (const [key, g] of extGroups.entries()) {
      if (knownBodies.has(bodyKey(g.text))) continue; // already rendered from the DB
      const future = g.scheduledTime > Date.now() + 60_000;
      const allDone = g.statuses.length > 0 && g.statuses.every((s) => s === 'completed');
      const anyLive = g.statuses.some((s) => s === 'pending' || s === 'posting');
      const status = allDone ? 'sent' : (future && anyLive ? 'scheduled' : (anyLive ? 'publishing' : 'sent'));
      extRows.push({
        id: `ext-queue-${key}`,
        campaign_name: (g.text || '').trim().split('\n')[0].slice(0, 60) || 'פוסט קבוצות',
        channel: 'facebook',
        message_body: g.text,
        created_at: new Date(g.createdAt).toISOString(),
        provider_message_id: null,
        media_urls: g.images,
        group_ids: g.groupIds,
        status,
        sent_at: status === 'scheduled' ? new Date(g.scheduledTime).toISOString() : null,
      });
    }
    const merged: CampaignRow[] = [...optimisticRows, ...extRows, ...base];
    const channelFiltered = activeChannel === 'all'
      ? merged
      : merged.filter((r) => String(r.channel || '').toLowerCase() === activeChannel);

    // Collapse recurring series: every scheduled row sharing the same
    // campaign_name+channel belongs to one series. Emit ONE master row
    // (the next upcoming slot) carrying `_seriesSlots` — an ordered list
    // of every future slot. All other rows in the series are removed
    // from the top-level feed so the page never floods with duplicates.
    const seriesMap = new Map<string, CampaignRow[]>();
    const nonSeries: CampaignRow[] = [];
    for (const r of channelFiltered) {
      if (isScheduledRow(r) && r.campaign_name) {
        const key = `${String(r.campaign_name).trim()}|${String(r.channel || '').toLowerCase()}`;
        const arr = seriesMap.get(key) || [];
        arr.push(r);
        seriesMap.set(key, arr);
      } else {
        nonSeries.push(r);
      }
    }
    const masters: CampaignRow[] = [];
    for (const arr of seriesMap.values()) {
      const sorted = [...arr].sort((a, b) => {
        const ta = a.sent_at ? new Date(a.sent_at).getTime() : 0;
        const tb = b.sent_at ? new Date(b.sent_at).getTime() : 0;
        return ta - tb;
      });
      const master = { ...sorted[0], _seriesSlots: sorted.map((s) => ({ id: s.id, sent_at: s.sent_at })) } as CampaignRow & { _seriesSlots: Array<{ id: string; sent_at: string | null }> };
      masters.push(master);
    }
    // Preserve original ordering: masters slot in at their earliest slot time.
    return [...nonSeries, ...masters].sort((a, b) => {
      const aTime = isScheduledRow(a) && a.sent_at ? new Date(a.sent_at).getTime() : new Date(a.created_at).getTime();
      const bTime = isScheduledRow(b) && b.sent_at ? new Date(b.sent_at).getTime() : new Date(b.created_at).getTime();
      // Scheduled items ascending by next-slot; published items descending.
      const aSched = isScheduledRow(a);
      const bSched = isScheduledRow(b);
      if (aSched && !bSched) return -1;
      if (!aSched && bSched) return 1;
      if (aSched && bSched) return aTime - bTime;
      return bTime - aTime;
    });
  }, [rows, activeChannel, optimisticRows, extensionQueue]);

  // Blocking loader ONLY on a true cold start: no cached rows in memory AND
  // the initial background load is still in-flight. As soon as we have any
  // rows (cached or freshly-loaded, even zero-length after settle), we render
  // the feed shell instead of hiding it behind "טוען…".
  if (rows === null && coldLoading) {
    return <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">טוען…</div>;
  }

  

  return (
    <div className="space-y-3">
      <SupportRequiredDialog
        channelLabel={supportChannel}
        open={!!supportChannel}
        onOpenChange={(v) => { if (!v) setSupportChannel(null); }}
      />
      <GlobalSocialFeed
        rows={rows ?? []}
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        connectedChannels={connectedChannels}
        onConnectChannel={handleFeedConnect}
      />


      {/* Inline queue tabs — published / future / drafts, all managed on this page. */}
      <div className="flex items-center gap-2" dir="rtl">
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
          {([
            { v: 'published' as FeedSubTab, label: 'פורסמו' },
            { v: 'future' as FeedSubTab, label: 'עתידיים' },
            { v: 'drafts' as FeedSubTab, label: 'טיוטות' },
          ]).map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => onSubTabChange?.(t.v)}
              style={{ fontSize: 'calc(0.875rem + 3px)' }}
              className={cn(
                'rounded-lg px-2 py-2 font-semibold transition',
                subTab === t.v
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="תצוגת לוח שנה"
          aria-label="תצוגת לוח שנה"
          className="shrink-0"
          onClick={() => window.dispatchEvent(new Event('rz:open-schedule-calendar'))}
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </div>

      {subTab !== 'published' ? altContent : filteredRows && filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">אין קמפיינים בערוץ זה</p>
          <p className="mt-1 text-xs text-muted-foreground">לאחר שתפעיל קמפיין מהטאב "צור קמפיין", הוא יופיע כאן עם מעקב לייקים, שיתופים ותגובות.</p>
        </div>
      ) : (filteredRows || []).map((r) => {


        const isOpen = expanded[r.id] ?? false;
        const scheduled = isScheduledRow(r);
        // A publish that Meta rejected: shown explicitly as "נכשל" with the exact
        // provider reason, never as a normal published post.
        const rawFailureReason = r.failure_reason || (r.provider_response as any)?.error || null;
        const hasGroupTargets = Array.isArray((r as any).group_ids) && (r as any).group_ids.length > 0;
        // Legacy Meta App Review errors are obsolete: group posts now run through
        // the browser-extension queue, so the old banner is suppressed and the
        // card reflects the live extension queue state instead.
        const legacyMetaError = hasGroupTargets && isLegacyMetaGroupError(rawFailureReason);
        const extQueueStatus = hasGroupTargets
          ? queueStatusForText(extensionQueue, r.message_body || '')
          : null;
        const failed =
          String(r.status || '').toLowerCase() === 'failed' &&
          !legacyMetaError &&
          extQueueStatus !== 'completed' &&
          extQueueStatus !== 'pending' &&
          extQueueStatus !== 'posting';
        const failureReason = failed ? (rawFailureReason || 'הפרסום לפייסבוק נכשל') : null;

        const seriesSlots = (r as any)._seriesSlots as Array<{ id: string; sent_at: string | null }> | undefined;
        const isSeries = Array.isArray(seriesSlots) && seriesSlots.length > 1;
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
        // Final render-time uniqueness guard: even if any upstream path leaks a
        // repeat, each image is painted exactly once.
        const uniqueMedia = uniqueMediaUrls(r.media_urls);

        const liveCount = liveCommentCounts[r.id];
        // Once the comment tree has been loaded (even once), it is the
        // authoritative count — top-level + follow-up replies. Never mix in
        // the inflated provider aggregate (dbComments); it double-counts.
        const dbComments = Math.max(0, typeof r.comment_count === 'number' ? r.comment_count : 0);
        const commentDisplay = typeof liveCount === 'number'
          ? Math.max(liveCount, dbComments)
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
                <div className="relative h-12 w-12 shrink-0">
                  <PostImage
                    src={uniqueMedia[0]}
                    candidates={uniqueMedia}
                    campaignLogId={r.id}
                    index={0}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover border border-border"
                    fallbackClassName="block h-12 w-12 rounded-lg border border-border bg-muted"
                  />
                  {uniqueMedia.length > 0 && (
                    <span
                      className="absolute -top-1 -right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 py-0 text-[10px] font-bold leading-4 text-white"
                      title={`${uniqueMedia.length} תמונות`}
                    >
                      {uniqueMedia.length}
                    </span>
                  )}
                </div>

                {/* Title = the real first line of the post. Clicking anywhere on
                    the card only toggles expand/collapse — never opens Facebook. */}
                <h3
                  className={cn('flex-1 font-semibold text-foreground line-clamp-2', alignClass)}
                  dir={dirAttr}
                >
                  {(bodyText.trim().split('\n')[0] || r.campaign_name)}
                </h3>
              </div>


              {/* Target groups — collapsed pill always visible, names on expand */}
              {hasGroupTargets && (
                <div onClick={(e) => e.stopPropagation()}>
                  <GroupStatusChips
                    groupIds={((r as any).group_ids as any[]).map((g) => String(g))}
                    meta={fbGroupMeta}
                    results={legacyMetaError ? undefined : groupResultMap((r.provider_response as any)?.group_results)}
                    defaultState={
                      extQueueStatus === 'completed'
                        ? 'published'
                        : extQueueStatus === 'pending' || extQueueStatus === 'posting' || legacyMetaError || scheduled
                          ? 'pending'
                          : failed
                            ? 'failed'
                            : 'published'
                    }
                    countdownIso={scheduled ? r.sent_at : null}
                    defaultOpen={isOpen}
                  />
                </div>
              )}

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
                })() : isPaused ? null : (extQueueStatus === 'completed' && hasGroupTargets) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    פורסם בקבוצות
                  </span>
                ) : ((extQueueStatus === 'pending' || extQueueStatus === 'posting' || legacyMetaError) && hasGroupTargets) ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800 ring-1 ring-blue-200"
                    title="הפוסט מנוהל בתור הפרסום של תוסף הדפדפן"
                  >
                    <Loader2 className={cn('h-3 w-3', extQueueStatus === 'posting' && 'animate-spin')} />
                    {extQueueStatus === 'posting' ? 'מפרסם דרך התוסף' : 'בתור התוסף'}
                  </span>
                ) : failed ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive ring-1 ring-destructive/30 max-w-[60%]"
                    title={failureReason ?? undefined}
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">נכשל · {failureReason}</span>
                  </span>
                ) : scheduled ? (() => {



                  const target = r.sent_at ? new Date(r.sent_at).getTime() : NaN;
                  const diff = Number.isFinite(target) ? target - Date.now() : NaN;
                  // Strict dd/hh/mm countdown — no extra wording, no series pill.
                  let label = '';
                  if (Number.isFinite(diff)) {
                    const s = Math.max(0, Math.floor(diff / 1000));
                    const pad = (n: number) => String(n).padStart(2, '0');
                    label = `${pad(Math.floor(s / 86400))}/${pad(Math.floor((s % 86400) / 3600))}/${pad(Math.floor((s % 3600) / 60))}`;
                  }
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 tabular-nums" dir="ltr">
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


            {isOpen && failed && failureReason && (
              <div
                className="mx-4 mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-semibold leading-relaxed text-destructive whitespace-pre-wrap break-words"
                dir="rtl"
              >
                <div className="mb-1 flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>הפרסום נכשל</span>
                </div>
                {failureReason}
              </div>
            )}


            {isOpen && (
              <>
                {isSeries && (
                  <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" dir="rtl">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-amber-900">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>סדרה מחזורית · {seriesSlots!.length} פרסומים עתידיים</span>
                    </div>
                    <ul className="mt-2 max-h-56 overflow-y-auto space-y-1 text-[12px] tabular-nums">
                      {seriesSlots!.map((slot, idx) => {
                        const d = slot.sent_at ? new Date(slot.sent_at) : null;
                        const label = d
                          ? d.toLocaleDateString('he-IL') + ', ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                          : '—';
                        return (
                          <li key={slot.id} className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1 text-amber-900">
                            <span className="text-[11px] font-semibold text-amber-800">#{idx + 1}{idx === 0 ? ' · הבא' : ''}</span>
                            <span>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {uniqueMedia.length > 0 && (() => {
                  // Mobile: one large hero image on top. Desktop: two large
                  // images side by side. The rest always sit underneath in a
                  // horizontal scrolling thumbnail strip.
                  const heroCount = uniqueMedia.length > 1 ? 2 : 1;
                  const heroes = uniqueMedia.slice(0, heroCount);
                  const rest = uniqueMedia.slice(heroCount);
                  const tile = (src: string, i: number, cls: string) => (
                    <div key={src} className={cn('relative group', cls)}>
                      <PostImage src={src} campaignLogId={r.id} index={i} alt=""
                           candidates={uniqueMedia}
                           className="h-full w-full rounded-lg object-cover border border-border"
                           fallbackClassName="h-full w-full" />
                      <button
                        type="button"
                        title="הסר תמונה"
                        aria-label="הסר תמונה"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('להסיר את התמונה מהפוסט?')) removeMediaUrl(r.id, src);
                        }}
                        className="absolute top-1 left-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                  return (
                    <div className="mx-4 mb-3 space-y-2">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2" dir="rtl">
                        {heroes.map((src, i) => (
                          <div key={src} className={cn('aspect-[4/3] w-full', i > 0 && 'hidden md:block')}>
                            {tile(src, i, 'h-full w-full')}
                          </div>
                        ))}
                      </div>
                      {(rest.length > 0 || heroCount > 1) && (
                        <div className="flex gap-2 overflow-x-auto pb-1" dir="rtl">
                          {/* On mobile the 2nd hero is not shown above, so it
                              joins the thumbnail strip instead. */}
                          {heroCount > 1 && (
                            <div className="h-20 w-20 shrink-0 md:hidden">
                              {tile(uniqueMedia[1], 1, 'h-20 w-20')}
                            </div>
                          )}
                          {rest.map((src, i) => (
                            <div key={src} className="h-20 w-20 shrink-0">
                              {tile(src, i + heroCount, 'h-20 w-20')}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

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
                    {/* Comment refresh lives at the trailing edge of the
                        "תגובות לקמפיין / תגובות המשך" row below. */}

                    {/* Attachment indicator removed from published cards. */}
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
                    headerActions={(() => {
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
                          size="icon"
                          title={label}
                          aria-label={label}
                          disabled={isRefreshing || onCooldown}
                          onClick={(e) => { e.stopPropagation(); bumpRefresh(r.id); }}
                          className={cn('h-7 w-7', onCooldown && 'opacity-50 cursor-not-allowed')}
                        >
                          {onCooldown ? (
                            <span className="tabular-nums text-[10px] font-medium">{formatCooldown(cooldownSecs)}</span>
                          ) : (
                            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
                          )}
                        </Button>
                      );
                    })()}
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
      <DeletePostDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        hasExternalPost={deleteTarget ? externalIdsFor(deleteTarget).length > 0 : false}
        onConfirm={async (mode) => { if (deleteTarget) await performDelete(deleteTarget, mode); }}
      />
    </div>
  );
};


const Stat = ({ icon: Icon, label, value, hasData = true }: { icon: any; label: string; value: number | null | undefined; hasData?: boolean }) => {
  // When Meta hasn't returned analytics yet (e.g. historical posts Meta
  // can't pull insights for, or freshly published posts before the
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
                      קדם נכס ספציפי בשיחה
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
                      הוראות, נושא או תסריט מותאם לשיחה
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


/* ───────────── Collapsed draft card ─────────────
   Every draft in a multi-property fan-out starts COLLAPSED and shows only its
   live status (generating / importing photos / ready). The composer inside
   stays mounted while collapsed so generation and photo import keep running. */

const DraftCollapsibleCard = ({
  index, iso, variant, totalVariants, children, status, onPublish, published, fallbackTitle,
}: {
  index: number;
  /** Property name resolved by the page, shown until the composer reports one. */
  fallbackTitle?: string;
  iso: string;
  variant: number;
  totalVariants: number;
  status: ComposerStatus | null;
  /** Dispatches this single draft without expanding the card. */
  onPublish?: () => void;
  published?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const busy = !!status && (status.generating || status.photosLoading);
  const statusLabel = published
    ? 'פורסם'
    : !status
      ? 'טוען…'
      : status.generating
        ? 'מנסח תוכן…'
        : status.photosLoading
          ? 'מייבא תמונות…'
          : status.ready
            ? `מוכן · ${status.images} תמונות`
            : status.chars > 0
              ? `${status.images} תמונות`
              : 'ממתין';
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm" dir="rtl">
      <div className="flex w-full items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-right"
        >
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          {status?.thumb ? (
            <img
              src={status.thumb}
              alt={status.title || `תמונת טיוטה ${index + 1}`}
              loading="lazy"
              className="h-11 w-11 shrink-0 rounded-lg border border-border/60 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground">
              {status?.photosLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-snug text-foreground break-words">
              {status?.title || fallbackTitle || `פוסט ${index + 1}`}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
              {totalVariants > 1 ? ` · וריאציה ${variant}/${totalVariants}` : ''}
            </div>
          </div>

        </button>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            published
              ? 'bg-emerald-100 text-emerald-800'
              : busy
                ? 'bg-amber-50 text-amber-700'
                : status?.ready
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-muted text-muted-foreground',
          )}
        >
          {busy && !published ? <Loader2 className="h-3 w-3 animate-spin" /> : (published || status?.ready) ? <CheckCircle2 className="h-3 w-3" /> : null}
          {statusLabel}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPublish?.(); }}
          disabled={published || !status?.canPublish}
          title={published ? 'הטיוטה פורסמה' : !status?.canPublish ? 'הטיוטה עדיין לא מוכנה לפרסום' : 'פרסם טיוטה זו'}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition',
            published || !status?.canPublish
              ? 'cursor-not-allowed bg-muted text-muted-foreground/80'
              : 'bg-[hsl(217,80%,18%)] text-white shadow-sm hover:bg-[hsl(217,80%,14%)]',
          )}
        >
          <Megaphone className="h-3.5 w-3.5" />
          פרסם
        </button>
      </div>
      {/* Kept mounted (hidden) so background work never restarts on toggle. */}
      <div className={open ? 'border-t border-border/60 p-1' : 'hidden'}>{children}</div>
    </div>
  );
};

/* ───────────── Page ───────────── */

const CampaignCenter = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Live status per collapsed draft card (keyed by composer instanceId).
  const [draftStatuses, setDraftStatuses] = useState<Record<string, ComposerStatus>>({});
  // Publish plumbing for the multi-draft view: each composer registers its
  // dispatch function so a collapsed card (and "publish all") can fire it.
  const publishFnsRef = useRef<Map<string, () => boolean>>(new Map());
  const activeDraftKeyRef = useRef<string | null>(null);
  const bulkQueueRef = useRef<string[]>([]);
  const [publishedDrafts, setPublishedDrafts] = useState<Set<string>>(new Set());
  // Bulk controls shared across every draft in the multi-draft view so the user
  // can update schedule/groups once before publishing all drafts.
  const [bulkGroupIds, setBulkGroupIds] = useState<string[]>([]);
  const [bulkScheduleIso, setBulkScheduleIso] = useState<string | null>(null);
  const [bulkGroupPickerOpen, setBulkGroupPickerOpen] = useState(false);
  // Emergency-stop state for bulk AI generation (persisted across refreshes).
  const [generationStopped, setGenerationStopped] = useState<boolean>(() => isGenerationStopped());
  useEffect(() => subscribeGenerationGate(setGenerationStopped), []);
  const [bulkScheduleDialogOpen, setBulkScheduleDialogOpen] = useState(false);
  const [bulkGlobalScheduleOpen, setBulkGlobalScheduleOpen] = useState(false);
  // Recurrence mode currently chosen in the global scheduler (mirrored from localStorage).
  const [bulkRecurrence, setBulkRecurrence] = useState<SchedulePrefs['recurrence']>('none');
  const recurrenceLabel = (r: SchedulePrefs['recurrence']) =>
    ({ none: 'ללא', daily: 'יומי', weekly: 'שבועי', monthly: 'חודשי', custom: 'מותאם' } as const)[r];

  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  // Persist bulk choices per workspace so a refresh doesn't lose the last

  // group/time selection for current and future multi-draft campaigns.
  // Hydration must wait for the workspace id, otherwise we would read the wrong
  // storage key, find nothing, and then overwrite the real selection with [].
  const groupsHydratedRef = useRef(false);
  useEffect(() => {
    if (!workspaceOwnerId || groupsHydratedRef.current) return;
    try {
      const sKey = `campaign:bulkScheduleIso:${workspaceOwnerId}`;
      const parsedGroups = loadCampaignGroups(workspaceOwnerId);
      const scheduledGroups = loadSchedulePrefs(workspaceOwnerId).selectedGroupIds;
      const restoredGroups = parsedGroups.length ? parsedGroups : scheduledGroups;
      if (restoredGroups.length) setBulkGroupIds(restoredGroups);
      const rawIso = localStorage.getItem(sKey);
      if (rawIso) {
        const d = new Date(rawIso);
        if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000) setBulkScheduleIso(rawIso);
      }
      setBulkRecurrence(loadSchedulePrefs(workspaceOwnerId).recurrence);
    } catch {}
    groupsHydratedRef.current = true;
  }, [workspaceOwnerId]);
  // Live sync: any group change made in the scheduling dialog updates the bubble.
  useEffect(() => subscribeCampaignGroups((ids) => {
    setBulkGroupIds((curr) => (JSON.stringify(curr) === JSON.stringify(ids) ? curr : ids));
  }), []);
  // Keep the calendar bubble + group count in sync after the global scheduler closes.
  useEffect(() => {
    if (!bulkGlobalScheduleOpen) {
      try {
        setBulkRecurrence(loadSchedulePrefs(workspaceOwnerId).recurrence);
        const shared = loadCampaignGroups(workspaceOwnerId);
        const scheduled = loadSchedulePrefs(workspaceOwnerId).selectedGroupIds;
        const restored = shared.length ? shared : scheduled;
        if (restored.length) setBulkGroupIds(restored);
      } catch {}
    }
  }, [bulkGlobalScheduleOpen, workspaceOwnerId]);
  useEffect(() => {
    // Never persist before hydration — that is what used to zero the count.
    if (!workspaceOwnerId || !groupsHydratedRef.current) return;
    saveCampaignGroups(workspaceOwnerId, bulkGroupIds);
  }, [bulkGroupIds, workspaceOwnerId]);


  useEffect(() => {
    try {
      const key = workspaceOwnerId ? `campaign:bulkScheduleIso:${workspaceOwnerId}` : 'campaign:bulkScheduleIso';
      if (bulkScheduleIso) localStorage.setItem(key, bulkScheduleIso);
      else localStorage.removeItem(key);
    } catch {}
  }, [bulkScheduleIso, workspaceOwnerId]);


  // One-click bulk publishing: every draft is dispatched silently, with no
  // per-draft confirmation dialog.
  const [bulkSilent, setBulkSilent] = useState(false);
  // Controlled history dialog so a finished bulk dispatch can land the user
  // directly on the "פוסטים עתידיים" tab with fresh rows.
  const [historyTab, setHistoryTab] = useState<FeedSubTab>('published');
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [historyGroupMeta, setHistoryGroupMeta] = useState<Record<string, { name: string; icon: string | null; memberCount?: number | null; url?: string | null }>>({});
  const [editSeriesRow, setEditSeriesRow] = useState<any | null>(null);


  const publishDraft = useCallback((key: string) => {
    const fn = publishFnsRef.current.get(key);
    if (!fn) return false;
    activeDraftKeyRef.current = key;
    const ok = fn();
    if (!ok) toast.info('הטיוטה עדיין לא מוכנה לפרסום');
    return ok;
  }, []);

  /**
   * Retires a published draft everywhere: the live list (via publishedDrafts),
   * the session assignments and the durable composer session — so a refresh
   * never resurrects a post that already went out.
   */
  const retirePublishedDraft = useCallback((key: string, channelId?: string) => {
    setPublishedDrafts((curr) => new Set(curr).add(key));
    setDraftStatuses((curr) => { const next = { ...curr }; delete next[key]; return next; });
    publishFnsRef.current.delete(key);
    try {
      const raw = sessionStorage.getItem('rz-schedule-assignments');
      const list: ComposerAssignment[] = raw ? JSON.parse(raw) || [] : [];
      const kept = list.filter((a, idx) => draftKeyFor(a, idx) !== key);
      sessionStorage.setItem('rz-schedule-assignments', JSON.stringify(kept));
      const keptIds = Array.from(new Set(kept.map((a) => a.listing).filter((v): v is string => Boolean(v))));
      setRestoredSession((prev) => (prev ? { ...prev, assignments: kept, propertyIds: keptIds } : prev));
      if (channelId) void saveComposerSession(channelId, keptIds, kept);
    } catch {}
  }, []);

  const publishAllDrafts = useCallback((keys: string[]) => {
    const queue = keys.filter((k) => !publishedDrafts.has(k) && publishFnsRef.current.has(k));
    if (!queue.length) { toast.info('אין טיוטות מוכנות לפרסום'); return; }
    // No confirmation dialogs in bulk mode — a single click ships them all.
    setBulkSilent(true);
    bulkQueueRef.current = queue.slice(1);
    if (!publishDraft(queue[0])) { bulkQueueRef.current = []; setBulkSilent(false); }
  }, [publishedDrafts, publishDraft]);

  /** Advances the bulk queue after one draft finished dispatching. */
  const advanceBulkQueue = useCallback(() => {
    const next = bulkQueueRef.current.shift();
    if (!next) {
      if (bulkSilent) {
        setBulkSilent(false);
        // Show the freshly scheduled posts immediately.
        setHistoryTab('future');
        setHistoryRefreshTick((t) => t + 1);
      }
      return false;
    }
    window.setTimeout(() => { if (!publishDraft(next)) advanceBulkQueue(); }, 200);
    return true;
  }, [publishDraft, bulkSilent]);


  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { settings } = useWhiteLabel();

  const brandName = settings?.agency_name || 'Realtyz AI';
  const [pickedChannel, setPickedChannel] = useState<ChannelCard | null>(null);
  const [pickedChannelIds, setPickedChannelIds] = useState<Set<string>>(new Set());

  const [voiceDialChannel, setVoiceDialChannel] = useState<ChannelCard | null>(null);
  const [ivrOpen, setIvrOpen] = useState(false);
  const [emailSetupOpen, setEmailSetupOpen] = useState(false);
  const [supportChannel, setSupportChannel] = useState<string | null>(null);

  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null);
  // Bump to force-remount the InlineComposer so its body/selectedListingId/media
  // state fully clear after a successful (or paused) dispatch.
  const [composerResetTick, setComposerResetTick] = useState(0);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  // Unpublished multi-property draft session (properties + slots + variants).
  // Restored from localStorage instantly and from the cloud right after, so
  // leaving the page or refreshing never loses the open drafts.
  const [restoredSession, setRestoredSession] = useState<ComposerSession | null>(null);
  // Property titles for the collapsed draft cards. Fetched at page level so a
  // card shows the address instantly. Titles are cached per workspace so a
  // refresh never flashes or blanks the address.
  const [listingTitles, setListingTitles] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`rz:listing-titles:${workspaceOwnerId ?? 'anon'}`);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    if (!workspaceOwnerId) return;
    const ids = new Set<string>();
    (searchParams.get('properties') || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((id) => ids.add(id));
    try {
      const raw = sessionStorage.getItem('rz-schedule-assignments');
      const arr: Array<{ listing?: string | null }> = raw ? JSON.parse(raw) : [];
      arr.forEach((a) => { if (a.listing) ids.add(a.listing); });
    } catch { /* ignore */ }
    if (restoredSession) {
      restoredSession.propertyIds?.forEach((id) => ids.add(id));
      restoredSession.assignments?.forEach((a) => { if (a.listing) ids.add(a.listing); });
    }
    if (ids.size === 0) return;
    const missing = [...ids].filter((id) => !listingTitles[id]);
    // Instant paint from cache is already in state. Fetch only what is missing
    // and merge without ever clearing existing titles.
    (async () => {
      let data: any[] = [];
      if (missing.length > 0) {
        const res = await supabase.from('listings').select('id, property_title, address, city').in('id', missing);
        data = (res.data as any[]) || [];
      }
      if (data.length === 0) return;
      const map: Record<string, string> = {};
      for (const l of data) {
        map[l.id] = [l.property_title || l.address, l.city].filter(Boolean).join(' · ') || 'נכס';
      }
      setListingTitles((curr) => {
        const next = { ...curr, ...map };
        try {
          localStorage.setItem(`rz:listing-titles:${workspaceOwnerId}`, JSON.stringify(next));
        } catch { /* ignore */ }
        return next;
      });
    })();
  }, [searchParams, restoredSession, workspaceOwnerId]);

  // Wipes every draft in the multi-draft composer: local snapshots, the durable
  // cloud mirror and the composer session. Nothing published is touched.
  const deleteAllDrafts = async () => {
    const chan = pickedChannel?.id ?? 'facebook';
    try {
      for (const store of [localStorage, sessionStorage]) {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && (k.startsWith('rz-composer-draft:') || k.startsWith('rz-composer-session:'))) keys.push(k);
        }
        keys.forEach((k) => store.removeItem(k));
      }
      sessionStorage.removeItem('rz-schedule-assignments');
    } catch { /* ignore */ }
    setRestoredSession(null);
    // A fresh, empty list must start with generation ENABLED again, so the
    // kill button shows the red stop icon rather than "resume".
    resumeGeneration();
    await Promise.allSettled([clearComposerSession(chan), clearComposerDraftsCloud(chan)]);
    setDraftStatuses({});
    setPublishedDrafts(new Set());
    setComposerResetTick((n) => n + 1);
    setDeleteAllOpen(false);
    toast.success('כל הטיוטות נמחקו');
    setSearchParams(new URLSearchParams());
  };
  // (campaignHistoryOpen is declared above, next to the bulk-publish plumbing)

  const [campaignHistoryRows, setCampaignHistoryRows] = useState<any[]>([]);
  const [campaignDraftRows, setCampaignDraftRows] = useState<any[]>([]);
  const [campaignHistoryLoading, setCampaignHistoryLoading] = useState(false);
  const [alsoEmail, setAlsoEmail] = useState(false);
  // Bulk selection + confirmation for permanently deleting saved drafts.
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  // Per-card selection circles appear only after the master "בחר הכל" is used.
  const [draftSelectMode, setDraftSelectMode] = useState(false);
  const [bulkDeleteDraftsOpen, setBulkDeleteDraftsOpen] = useState(false);
  const [bulkDeletingDrafts, setBulkDeletingDrafts] = useState(false);
  const toggleDraftSelected = (id: string) =>
    setSelectedDraftIds((curr) => (curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]));
  const bulkDeleteSelectedDrafts = async () => {
    const ids = [...selectedDraftIds];
    if (ids.length === 0) return;
    setBulkDeletingDrafts(true);
    const { error } = await supabase.from('ai_content_logs').delete().in('id', ids);
    setBulkDeletingDrafts(false);
    setBulkDeleteDraftsOpen(false);
    if (error) { toast.error('מחיקת הטיוטות נכשלה'); setHistoryRefreshTick((t) => t + 1); return; }
    setCampaignDraftRows((prev) => prev.filter((x) => !ids.includes(x.id)));
    setSelectedDraftIds([]);
    setDraftSelectMode(false);
    toast.success(`${ids.length} טיוטות נמחקו`);
  };


  // Restore the last unpublished draft session (local first, cloud second) and
  // keep it saved whenever the composer is opened with a fan-out.
  useEffect(() => {
    const channelId = pickedChannel?.id;
    if (!channelId) return;
    let cancelled = false;
    const local = readComposerSessionLocal(channelId);
    if (local) setRestoredSession(local);
    (async () => {
      const cloud = await fetchComposerSession(channelId);
      if (!cancelled && cloud) {
        setRestoredSession((prev) =>
          prev && prev.updatedAt >= cloud.updatedAt ? prev : cloud,
        );
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedChannel?.id]);

  useEffect(() => {
    const channelId = pickedChannel?.id;
    if (!channelId) return;
    const ids = (searchParams.get('properties') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    let assignments: ComposerAssignment[] = [];
    try {
      const raw = sessionStorage.getItem('rz-schedule-assignments');
      if (raw) assignments = JSON.parse(raw) || [];
    } catch {}
    if (ids.length <= 1 && assignments.length <= 1) return;
    void saveComposerSession(channelId, ids, assignments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedChannel?.id, searchParams]);


  useEffect(() => {
    const open = () => { setHistoryTab('published'); };
    window.addEventListener('rz:open-campaign-history', open);
    return () => window.removeEventListener('rz:open-campaign-history', open);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setCampaignHistoryLoading(true);
    void (async () => {
      const scope = workspaceOwnerId ?? user.id;
      const cols = 'id,campaign_name,channel,message_body,status,sent_at,created_at,media_urls,listing_id,series_id,series_index,series_total,needs_regeneration,group_ids,recurrence_rule';
      // Two dedicated queries: future scheduled slots (hundreds of them, some
      // years out) must never crowd the published history out of the payload.
      const [{ data: sentLogs }, { data: futureLogs }, { data: drafts }, { data: groups }] = await Promise.all([
        supabase.from('campaign_logs')
          .select(cols)
          .or(`workspace_owner_id.eq.${scope},user_id.eq.${scope}`)
          .eq('is_archived', false)
          .in('status', ['sent', 'published', 'completed'])
          .order('sent_at', { ascending: false, nullsFirst: false })
          .limit(250),
        // Every queued row, including slots whose time already passed but that
        // were never dispatched — those must still be listed under "עתידיים".
        supabase.from('campaign_logs')
          .select(cols)
          .or(`workspace_owner_id.eq.${scope},user_id.eq.${scope}`)
          .eq('is_archived', false)
          .in('status', ['scheduled', 'pending', 'queued'])
          .order('sent_at', { ascending: true, nullsFirst: true })
          .limit(500),

        supabase.from('ai_content_logs')
          .select('id,topic,generated_text,platform,created_at,updated_at,media_urls,listing_id')
          .eq('created_by', user.id)
          .order('updated_at', { ascending: false })
          .limit(100),
        // No workspace filter: group rows may be imported under a different
        // workspace stamp, and a missing name would show as "קבוצה 1234".
        (supabase as any).from('fb_user_groups')
          .select('group_id,group_name,group_icon,group_url,member_count')
          .limit(2000),
      ]);
      if (!cancelled) {
        setCampaignHistoryRows([...(sentLogs ?? []), ...(futureLogs ?? [])]);
        setCampaignDraftRows(drafts ?? []);
        const meta: Record<string, { name: string; icon: string | null; memberCount?: number | null; url?: string | null }> = {};
        (groups ?? []).forEach((g: any) => {
          const id = String(g?.group_id ?? '');
          if (!id) return;
          const entry = {
            name: g.group_name || id,
            icon: g.group_icon ?? null,
            memberCount: typeof g.member_count === 'number' ? g.member_count : null,
            url: g.group_url ?? null,
          };
          meta[id] = entry;
          // Index the bare id too — campaign_logs stores "ext:<id>"/"manual:<id>".
          meta[id.replace(/^(ext:|manual:)/, '')] = entry;
        });
        setHistoryGroupMeta(meta);
        setCampaignHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, workspaceOwnerId, historyRefreshTick]);
  // Hydrate connection state from localStorage so a page refresh (or a new
  // tab) doesn't visually "disconnect" channels while verification re-runs.
  const [connectedChannels, setConnectedChannels] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    try {
      const key = connectionStorageKey('rz-connected-channels', user?.id, workspaceOwnerId);
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (raw) (JSON.parse(raw) as string[]).filter((id) => id !== 'facebook').forEach((id) => initial.add(id));
    } catch { /* ignore */ }
    return initial.size > 0 ? initial : EMPTY_CONNECTED;
  });
  const [channelAccountNames, setChannelAccountNames] = useState<Record<string, string>>(() => {
    try {
      const key = connectionStorageKey('rz-connected-channel-names', user?.id, workspaceOwnerId);
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        delete parsed.facebook;
        return parsed;
      }
    } catch { /* ignore */ }
    return {};
  });
  const [socialAccountProfiles, setSocialAccountProfiles] = useState<SocialAccountProfile[]>([]);

  useEffect(() => {
    const channelsKey = connectionStorageKey('rz-connected-channels', user?.id, workspaceOwnerId);
    const namesKey = connectionStorageKey('rz-connected-channel-names', user?.id, workspaceOwnerId);
    try {
      const rawChannels = localStorage.getItem(channelsKey) || sessionStorage.getItem(channelsKey);
      const nextChannels = new Set<string>();
      if (rawChannels) (JSON.parse(rawChannels) as string[]).filter((id) => id !== 'facebook').forEach((id) => nextChannels.add(id));
      setConnectedChannels(nextChannels.size ? nextChannels : EMPTY_CONNECTED);
      const rawNames = localStorage.getItem(namesKey) || sessionStorage.getItem(namesKey);
      const nextNames = rawNames ? JSON.parse(rawNames) as Record<string, string> : {};
      delete nextNames.facebook;
      setChannelAccountNames(nextNames);
    } catch {
      setConnectedChannels(EMPTY_CONNECTED);
      setChannelAccountNames({});
    }
    setSocialAccountProfiles([]);
  }, [user?.id, workspaceOwnerId]);

  const clearSocialConnectionState = (channels: string[] = ['facebook']) => {
    setConnectedChannels((prev) => new Set([...prev].filter((id) => !channels.includes(id))));
    setSocialAccountProfiles((prev) => prev.filter((p) => !channels.includes(p.platform) && !(channels.includes('facebook') && p.platform.startsWith('facebook'))));
    setChannelAccountNames((prev) => {
      const next = { ...prev };
      channels.forEach((id) => { delete next[id]; });
      return next;
    });
    try {
      if (channels.includes('facebook')) writeFbBindingFlag(false, workspaceOwnerId);
      const channelsKey = connectionStorageKey('rz-connected-channels', user?.id, workspaceOwnerId);
      const namesKey = connectionStorageKey('rz-connected-channel-names', user?.id, workspaceOwnerId);
      const cached = localStorage.getItem(channelsKey);
      if (cached) localStorage.setItem(channelsKey, JSON.stringify((JSON.parse(cached) as string[]).filter((id) => !channels.includes(id))));
      const names = localStorage.getItem(namesKey);
      if (names) {
        const parsed = JSON.parse(names) as Record<string, string>;
        channels.forEach((id) => { delete parsed[id]; });
        localStorage.setItem(namesKey, JSON.stringify(parsed));
      }
    } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: ['social-connections'] });
    queryClient.invalidateQueries({ queryKey: ['meta-page-binding'] });
  };

  useEffect(() => {
    const handleDisconnect = () => clearSocialConnectionState(['facebook']);
    window.addEventListener('realtyz:facebook-disconnected', handleDisconnect);
    return () => window.removeEventListener('realtyz:facebook-disconnected', handleDisconnect);
  }, []);

  // Persist whenever the resolved connection state changes — keeps the grid
  // "remembered" across reloads and new tabs.
  useEffect(() => {
    if (!user?.id || !workspaceOwnerId) return;
    try { localStorage.setItem(connectionStorageKey('rz-connected-channels', user.id, workspaceOwnerId), JSON.stringify([...connectedChannels])); } catch { /* ignore */ }
  }, [connectedChannels, user?.id, workspaceOwnerId]);
  useEffect(() => {
    if (!user?.id || !workspaceOwnerId) return;
    try { localStorage.setItem(connectionStorageKey('rz-connected-channel-names', user.id, workspaceOwnerId), JSON.stringify(channelAccountNames)); } catch { /* ignore */ }
  }, [channelAccountNames, user?.id, workspaceOwnerId]);

  // Default-select Facebook when nothing is picked yet. Facebook publishes via
  // the native Page token resolved server-side, so we never gate the default
  // selection on the async connection probe.
  useEffect(() => {
    if (pickedChannel) return;
    const fb = CHANNEL_CARDS.find((c) => c.id === 'facebook');
    if (fb) {
      setPickedChannel(fb);
      setPickedChannelIds((prev) => (prev.has('facebook') ? prev : new Set(prev).add('facebook')));
    }
  }, [connectedChannels, pickedChannel]);





  // STRICT WORKSPACE ISOLATION: only show a channel as connected when
  // (1) this workspace has its OWN bound Facebook Page in
  //     `messenger_page_bindings`, AND
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

        const { data: wsp, error: wspErr } = await supabase
          .from('messenger_page_bindings')
          .select('page_id, page_name')
          .eq('owner_id', workspaceOwnerId ?? '')
          .limit(1)
          .maybeSingle();
        let wspFbId = ((wsp as any)?.page_id as string | null) ?? null;
        let wspFbName = ((wsp as any)?.page_name as string | null) ?? null;
        if (isBlockedFbPage(wspFbId, wspFbName)) { wspFbId = null; wspFbName = null; }
        if (!wspFbId) {

          // The client read is RLS-scoped to the workspace owner; the edge
          // function resolves the same binding for every workspace member.
          const resolved = await resolveMetaPageViaFunction();
          if (resolved.pageId) {
            wspFbId = resolved.pageId;
            wspFbName = wspFbName ?? resolved.pageName;
          }
        }
        const hasOwnProfile = !!wspFbId;
        if (hasOwnProfile) writeFbBindingFlag(true, workspaceOwnerId);
        if (!hasOwnProfile) {
          if (wspErr) {
            // Transient read failure (RLS blip / offline) — never downgrade a
            // known-good Facebook connection to "disconnected".
            console.warn('[CampaignCenter] page binding read failed:', wspErr.message);
          } else {
            writeFbBindingFlag(false, workspaceOwnerId);
            if (!cancelled) clearSocialConnectionState([...SOCIAL_CHANNEL_IDS]);
          }
          // continue — still derive direct channels (IVR/email) below
        } else {
          if (wspFbName && !cancelled) {
            setChannelAccountNames((prev) => ({ ...prev, facebook: wspFbName as string }));
          }

        }
        if (cancelled) return;

        const set = new Set<string>();

        if (hasOwnProfile) {
          // A bound Facebook Page is by itself a valid connected state — the
          // manual-token path never writes to `social_connections`.
          if (wspFbId) set.add('facebook');

          // WORKSPACE-SHARED connection state — every workspace member sees the
          // same connected channels (owner / super-admin / managers / tenants).
          // No `created_by` / `user_id` filters here; RLS allows read for all
          // authenticated members.
          const { data: conns, error: connsErr } = await supabase
            .from('social_connections')
            .select('platform, is_connected')
            .eq('is_connected', true);
          const { data: accountRows, error: accountRowsErr } = await supabase
            .from('social_connections')
            .select('id, platform, display_name, credentials, is_connected')
            .eq('is_connected', true);
          if (cancelled) return;

          if (connsErr || accountRowsErr) {
            console.warn('[CampaignCenter] social conn fetch error:', connsErr?.message || accountRowsErr?.message);
          }

          // Dedupe by platform+account_ref so duplicate rows from older
          // imports don't render the same page twice on the FB card.
          const seenAcct = new Set<string>();
          const profiles = ((accountRows as any[]) || [])
            .map((r) => {
              const cred = (r?.credentials || {}) as Record<string, any>;
              const acctRef = String(cred.page_id || cred.account_id || cred.id || '').trim();
              const platform = String(r?.platform || '').toLowerCase();
              return {
                id: r?.id,
                platform,
                accountRef: acctRef,
                profileKey: null as string | null,
                name: cred.page_name || cred.account_name || r?.display_name || acctRef || 'Facebook',
                username: null as string | null,
                avatar: cred.avatar_url || cred.picture_url || null,
                profileUrl: acctRef ? buildAccountUrl(platform, acctRef) : null,
              };
            })
            .filter((p) => {
              const k = `${p.platform}:${p.accountRef}`;
              if (seenAcct.has(k)) return false;
              seenAcct.add(k);
              return true;
            });
          profiles.forEach((p) => {
            if (p.platform.startsWith('facebook')) set.add('facebook');
          });
          // Surface the bound Page on the Facebook card even when no
          // `social_connections` row exists yet (manual token connection).
          if (wspFbId && !profiles.some((p) => p.platform.startsWith('facebook') && p.accountRef === wspFbId)) {
            profiles.unshift({
              id: `page:${wspFbId}`,
              platform: 'facebook',
              accountRef: wspFbId,
              profileKey: null,
              name: wspFbName || 'Facebook',
              username: null,
              avatar: null,
              profileUrl: buildAccountUrl('facebook', wspFbId),
            });
          }
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

    if (!isNativeChannel(c.id)) {
      setSupportChannel(c.label ?? c.id);
      return;
    }
    if (c.id !== 'facebook' && c.id !== 'instagram') {
      window.location.href = '/profile?tab=connections';
      return;
    }

    try {
      toast.loading('פותח חיבור לפייסבוק…', { id: 'meta-connect' });
      const { data, error } = await supabase.functions.invoke('meta-page-connect', {
        body: {
          action: 'start',
          redirect_uri: oauthRedirectUri(),
          return_origin: oauthReturnOrigin(),
        },
      });
      toast.dismiss('meta-connect');
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
      const url = (data as any)?.auth_url;
      if (!url) {
          toast.error((data as any)?.error || 'לא התקבל קישור חיבור מ-Meta');
        return;
      }
      // Popup / new tab: window.top.location is blocked by the preview iframe sandbox.
      if (!openOAuthWindow(String(url))) {
        toast.error('הדפדפן חסם את חלון ההתחברות. אפשרו חלונות קופצים ונסו שוב.');
      }
    } catch (e: any) {
      toast.dismiss('meta-connect');
      toast.error(e?.message ?? 'יצירת חיבור נכשלה');
    }
  };




  // Default landing view = sent campaigns feed. The composer panel is now
  // opened on demand via the "+" button in the page hero (see PageHero).
  const initial = (searchParams.get('tab') as string) ?? 'published';
  const active: TabValue = initial === 'calendar' ? 'calendar' : initial === 'create' ? 'create' : 'published';

  /**
   * CLEAN SLATE: opening the composer for a brand-new post starts from
   * scratch — no property pre-selected, no leftover recurrence, and above all
   * NO leftover group selection. A post must target only and exactly the groups
   * explicitly chosen for that specific instance.
   */
  const resetComposerForNewPost = () => {
    try {
      saveCampaignGroups(workspaceOwnerId, []);
      setBulkGroupIds([]);
      setBulkRecurrence('none');
      saveSchedulePrefs(workspaceOwnerId, DEFAULT_SCHEDULE_PREFS);
      saveSchedulePrefs(workspaceOwnerId, DEFAULT_SCHEDULE_PREFS, 'composer');
      const prefix = 'rz-composer-draft:v2:';
      Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
      Object.keys(sessionStorage).filter((k) => k.startsWith(prefix)).forEach((k) => sessionStorage.removeItem(k));
    } catch { /* storage unavailable */ }
  };

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    const freshCompose = value === 'create'
      && active !== 'create'
      && !next.get('listing')
      && !next.get('properties')
      && !next.get('schedule');
    if (freshCompose) resetComposerForNewPost();
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

  // Deep-link entry (e.g. the airplane action on /properties):
  // ?tab=create&channel=facebook&properties=<listingId> preselects the channel
  // so the composer mounts immediately and auto-generates the post.
  const channelParam = searchParams.get('channel');
  useEffect(() => {
    if (!channelParam) return;
    const card = CHANNEL_CARDS.find((c) => c.id === channelParam);
    if (!card) return;
    setPickedChannel((prev) => prev ?? card);
    setPickedChannelIds((prev) => (prev.has(card.id) ? prev : new Set([...prev, card.id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelParam]);


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

  // Inline queue lists (drafts / future) rendered inside the posts feed, right
  // below the social-logos strip. Replaces the old history dialog.
  const queueAltContent = campaignHistoryLoading ? (
    <div className="flex h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  ) : historyTab === 'drafts' ? (
    <div className="space-y-2" dir="rtl">
      {campaignDraftRows.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-foreground">
            <Checkbox
              checked={draftSelectMode}
              onCheckedChange={(v) => {
                const on = v === true;
                setDraftSelectMode(on);
                setSelectedDraftIds(on ? campaignDraftRows.map((x) => x.id) : []);
              }}
              aria-label="בחר את כל הטיוטות"
            />
            בחר הכל ({selectedDraftIds.length}/{campaignDraftRows.length})
          </label>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedDraftIds.length === 0}
            onClick={() => setBulkDeleteDraftsOpen(true)}
          >
            <Trash2 className="me-1 h-4 w-4" /> מחיקת הנבחרות
          </Button>
        </div>
      )}
      <Dialog open={bulkDeleteDraftsOpen} onOpenChange={(v) => { if (!bulkDeletingDrafts) setBulkDeleteDraftsOpen(v); }}>
        <DialogContent dir="rtl" className="max-w-sm text-right">
          <DialogHeader>
            <DialogTitle className="text-right">מחיקת {selectedDraftIds.length} טיוטות</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">הפעולה סופית ולא ניתן לשחזר את הטיוטות. להמשיך?</p>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="destructive" disabled={bulkDeletingDrafts} onClick={() => { void bulkDeleteSelectedDrafts(); }}>
              {bulkDeletingDrafts ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק לצמיתות'}
            </Button>
            <Button variant="outline" disabled={bulkDeletingDrafts} onClick={() => setBulkDeleteDraftsOpen(false)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {campaignDraftRows.map((r) => {

        const media = Array.isArray(r.media_urls) ? r.media_urls : [];
        const first = media[0];
        const firstUrl = typeof first === 'string' ? first : (first as any)?.url ?? null;
        const title = String(r.generated_text || '').trim().split('\n')[0] || r.topic || 'טיוטת פוסט';
        return (
          <QueueCard
            key={r.id}
            title={title}
            imageUrl={firstUrl}
            imageCount={media.length}
            groupIds={bulkGroupIds}
            groupMeta={historyGroupMeta}
            groupEmptyLabel="לא נבחרו קבוצות לטיוטה"
            status="draft"
            dateLabel={new Date(r.updated_at || r.created_at).toLocaleString('he-IL')}
            actions={
              <>
                {draftSelectMode && (
                  <Checkbox
                    checked={selectedDraftIds.includes(r.id)}
                    onCheckedChange={() => toggleDraftSelected(r.id)}
                    aria-label="בחירת טיוטה למחיקה"
                    className="shrink-0"
                  />
                )}
                <Button

                  size="icon"
                  variant="outline"
                  title="עריכת הטיוטה"
                  aria-label="עריכת הטיוטה"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('tab', 'create'); next.set('channel', r.platform || 'facebook');
                    if (r.listing_id) { next.set('listing', r.listing_id); next.set('properties', r.listing_id); }
                    setSearchParams(next);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="מחק טיוטה"
                  aria-label="מחק טיוטה"
                  className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                  onClick={async () => {
                    setCampaignDraftRows((prev) => prev.filter((x) => x.id !== r.id));
                    const { error } = await supabase.from('ai_content_logs').delete().eq('id', r.id);
                    if (error) { toast.error('מחיקת הטיוטה נכשלה'); setHistoryRefreshTick((t) => t + 1); }
                    else toast.success('הטיוטה נמחקה');
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            }
          />
        );
      })}
      {campaignDraftRows.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">אין טיוטות</p>}
    </div>
  ) : (
    <div className="space-y-2" dir="rtl">
      {(() => {
        const future = campaignHistoryRows
          .filter((r) => ['scheduled', 'pending'].includes(r.status) && new Date(r.sent_at).getTime() > Date.now())
          .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
        // ONLY the next upcoming run of each series is ever shown — recurring
        // posts must never surface far-future slots (e.g. 10.12.2026).
        const seen = new Set<string>();
        const visible = future.filter((r) => {
          const key = r.series_id || `${r.campaign_name}|${r.channel}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (!visible.length) return <p className="py-12 text-center text-sm text-muted-foreground">אין פוסטים עתידיים</p>;
        return visible.map((r) => {
          const media = Array.isArray(r.media_urls) ? r.media_urls : [];
          const image = media.length ? media[Math.abs(Number(r.series_index || 0)) % media.length] : null;
          const imageUrl = typeof image === 'string' ? image : (image as any)?.url ?? null;
          const groupIds: string[] = Array.isArray(r.group_ids) ? r.group_ids.map((g: any) => String(g)) : [];
          const title = String(r.message_body || '').trim().split('\n')[0] || r.campaign_name || 'פוסט עתידי';
          return (
            <QueueCard
              key={r.id}
              title={title}
              imageUrl={imageUrl}
              imageCount={media.length}
              groupIds={groupIds}
              groupMeta={historyGroupMeta}
              groupEmptyLabel="ללא קבוצות — פרסום לעמוד בלבד"
              status="scheduled"
              countdownIso={r.sent_at}
              dateLabel={new Date(r.sent_at).toLocaleString('he-IL')}
              actions={
                <>
                  <Button
                    size="icon"
                    variant="outline"
                    title="עריכת קבוצות ונכסים"
                    aria-label="עריכת קבוצות ונכסים"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setEditSeriesRow(r)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="מחק פוסט מתוזמן"
                    aria-label="מחק פוסט מתוזמן"
                    className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      setCampaignHistoryRows((prev) => prev.filter((x) => x.id !== r.id));
                      const { error } = await supabase.from('campaign_logs').delete().eq('id', r.id);
                      if (error) { toast.error('מחיקת הפוסט המתוזמן נכשלה'); setHistoryRefreshTick((t) => t + 1); }
                      else toast.success('הפוסט המתוזמן נמחק');
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              }
            />
          );
        });
      })()}
    </div>
  );


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
            onAddFacebookPage={() => { void handleConnectChannel(CHANNEL_CARDS.find((c) => c.id === 'facebook')!); }}
          />
          {pickedChannel && (() => {
            const propertiesParam = searchParams.get('properties') || '';
            let propertyIds = propertiesParam.split(',').map((s) => s.trim()).filter(Boolean);
            let assignments: ComposerAssignment[] = [];
            try {
              const raw = sessionStorage.getItem('rz-schedule-assignments');
              if (raw) assignments = JSON.parse(raw) || [];
            } catch {}
            // Nothing in the URL / session? Restore the last unpublished draft
            // session (properties, slots, variants) so all open drafts come
            // back exactly as they were left.
            if (propertyIds.length <= 1 && assignments.length === 0) {
              const saved = restoredSession ?? readComposerSessionLocal(pickedChannel.id);
              if (saved && (saved.assignments.length > 1 || saved.propertyIds.length > 1)) {
                propertyIds = saved.propertyIds;
                assignments = saved.assignments;
              }
            }
            // Single composer when no multi-property fan-out
            if (propertyIds.length <= 1 && assignments.length <= 1) {

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
            const allBlocks = assignments.length > 0
              ? assignments
              : propertyIds.map((lid, i) => ({ iso: searchParams.get('schedule') || new Date().toISOString(), listing: lid, variant: 1, totalVariants: 1 }));
            // Published drafts leave the list instantly (no refresh needed) —
            // their key is retired the moment the dispatch succeeds.
            const blocks = allBlocks.filter((b, idx) => !publishedDrafts.has(draftKeyFor(b, idx)));
            const keyOf = (b: (typeof allBlocks)[number]) => draftKeyFor(b, allBlocks.indexOf(b));
            const distinctCampaignProperties = new Set(
              blocks.map((b) => b.listing).filter((id): id is string => Boolean(id)),
            ).size;
            // Older restored sessions may contain the seven slots but not the
            // redundant propertyIds array. In that case each slot still
            // represents its property, so never render a misleading zero.
            const campaignPropertyCount = distinctCampaignProperties || blocks.length;
            const unpublishedCount = blocks.length;
            const readyKeys = blocks
              .map((b) => keyOf(b))
              .filter((k) => draftStatuses[k]?.canPublish);
            if (blocks.length === 0) {
              return (
                <div className="space-y-4 pb-24" dir="rtl">
                  <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-6 text-center text-sm font-semibold text-emerald-800">
                    כל הטיוטות פורסמו ונכנסו לתור הפוסטים העתידיים.
                  </div>
                  <div className="flex justify-center">
                    <Button onClick={() => { setHistoryTab('future'); setHistoryRefreshTick((t) => t + 1); }}>
                      צפייה בפוסטים העתידיים
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div className="space-y-4 pb-44">
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-foreground" dir="rtl">
                  נוצרו <span className="font-bold">{blocks.length}</span> טיוטות פוסט עבור <span className="font-bold">{campaignPropertyCount}</span> נכסים. ערוך, אשר ושגר כל אחת בנפרד.
                </div>
                {blocks.map((b, idx) => {
                  // Order-independent key: a refresh (or a reshuffled property
                  // rotation) must map every draft back to the SAME stored
                  // snapshot, otherwise restored work looks lost and the AI
                  // regenerates from scratch.
                  const key = keyOf(b);
                  return (
                  <DraftCollapsibleCard
                    key={`${b.listing || 'na'}-${b.iso}-${idx}-${composerResetTick}`}
                    index={idx}
                    iso={b.iso}
                    variant={b.variant}
                    totalVariants={b.totalVariants}
                    status={draftStatuses[key] ?? null}
                    fallbackTitle={b.listing ? listingTitles[b.listing] : undefined}
                    published={publishedDrafts.has(key)}
                    onPublish={() => { publishDraft(key); }}
                  >
                    <InlineComposer
                      channel={pickedChannel}
                      brandName={brandName}
                      socialProfiles={socialAccountProfiles}
                      onConfirm={(p) => { activeDraftKeyRef.current = key; setConfirmPayload(p); }}
                      onOpenScheduleCalendar={() => handleChange('calendar')}
                      presetListingId={b.listing}
                      presetScheduleIso={b.iso}
                      presetVariant={b.variant}
                      presetVariants={b.totalVariants}
                      instanceId={key}
                      bulkGroupIds={bulkGroupIds}
                      bulkScheduleIso={bulkScheduleIso}
                      onBulkGroupIdsChange={setBulkGroupIds}
                      hideBottomBar
                      onRegisterPublish={(fn) => {
                        if (fn) publishFnsRef.current.set(key, fn);
                        else publishFnsRef.current.delete(key);
                      }}
                      onStatus={(s) => setDraftStatuses((curr) => (
                        curr[key] && JSON.stringify(curr[key]) === JSON.stringify(s)
                          ? curr
                          : { ...curr, [key]: s }
                      ))}
                    />

                  </DraftCollapsibleCard>
                  );
                })}
                {/* Bulk dispatch — publishes every ready draft one after another. */}
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur" dir="rtl">
                  <div className="mx-auto flex max-w-3xl items-stretch gap-2">
                  <div className="flex items-stretch gap-2">

                    {generationStopped ? (
                      <button
                        type="button"
                        onClick={() => { resumeGeneration(); toast.success('יצירת התוכן חודשה'); }}
                        title="חידוש יצירת תוכן"
                        aria-label="חידוש יצירת תוכן"
                        className="inline-flex items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-700 transition hover:bg-emerald-500/20"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { stopAllGeneration(); toast.info('כל היצירה נעצרה מיד. כל מה שנוצר עד כה נשמר.'); }}
                        title="עצור יצירת תוכן מיד (התוכן שנוצר נשמר)"
                        aria-label="עצור יצירת תוכן מיד"
                        className="inline-flex items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive transition hover:bg-destructive/20"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteAllOpen(true)}
                      title="מחק את כל הטיוטות"
                      aria-label="מחק את כל הטיוטות"
                      className="inline-flex items-center justify-center rounded-xl border border-destructive/30 bg-card px-4 py-3 text-destructive shadow-sm transition hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkGlobalScheduleOpen(true)}
                      title="תזמון קמפיין גלובלי לכל הטיוטות"
                      aria-label="תזמון קמפיין גלובלי לכל הטיוטות"
                      className="relative inline-flex items-center justify-center rounded-xl border border-[hsl(217,80%,18%)]/30 bg-card px-4 py-3 text-[hsl(217,80%,18%)] shadow-sm transition hover:bg-[hsl(217,80%,18%)]/5"
                    >

                      <CalendarIcon className="h-4 w-4" />
                      <span className="absolute -top-1 -left-1 min-w-[18px] rounded-full bg-[hsl(217,80%,18%)] px-1.5 text-[10px] font-bold leading-[18px] text-white" dir="ltr">
                        {recurrenceLabel(bulkRecurrence)}
                      </span>
                    </button>
                    {pickedChannel?.id === 'facebook' && (
                      <button
                        type="button"
                        onClick={() => setBulkGroupPickerOpen(true)}
                        title="בחירת קבוצות לכל הטיוטות"
                        aria-label="בחירת קבוצות לכל הטיוטות"
                        className="relative inline-flex items-center justify-center rounded-xl border border-[hsl(217,80%,18%)]/30 bg-card px-4 py-3 text-[hsl(217,80%,18%)] shadow-sm transition hover:bg-[hsl(217,80%,18%)]/5"
                      >
                        <Users className="h-4 w-4" />
                        <span className="absolute -top-1 -left-1 min-w-[18px] rounded-full bg-[hsl(217,80%,18%)] px-1 text-[10px] font-bold leading-[18px] text-white" dir="ltr">
                          {bulkGroupIds.length}
                        </span>
                      </button>
                    )}
                  </div>
                  {/* Publish sits at the far end of the same row, opposite the action icons. */}
                  <button
                    type="button"
                    onClick={() => publishAllDrafts(blocks.map((b) => keyOf(b)))}
                    disabled={readyKeys.length === 0}
                    className={cn(
                      'ms-auto flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition',
                      readyKeys.length
                        ? 'bg-[hsl(217,80%,18%)] text-white shadow-md hover:bg-[hsl(217,80%,14%)]'
                        : 'cursor-not-allowed bg-muted text-muted-foreground/80',
                    )}
                  >
                    פרסם את כל הטיוטות ({unpublishedCount})
                  </button>

                  </div>
                </div>

                {/* Delete-all confirmation. */}
                <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                  <DialogContent dir="rtl" className="w-[92vw] sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle className="text-right">למחוק את כל הטיוטות?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground text-right">
                      הפעולה מוחקת את כל {blocks.length} הטיוטות (טקסט, תמונות ותזמונים שלא פורסמו).
                      פוסטים שכבר פורסמו או שתוזמנו בתור לא ייפגעו.
                    </p>
                    <div className="flex justify-start gap-2 pt-2">
                      <Button variant="destructive" onClick={() => { void deleteAllDrafts(); }}>
                        מחק הכל
                      </Button>
                      <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>ביטול</Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Bulk schedule dialog — applies to every draft in the multi-draft view. */}
                <Dialog open={bulkScheduleDialogOpen} onOpenChange={setBulkScheduleDialogOpen}>
                  <DialogContent dir="rtl" className="w-[92vw] sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle className="text-right">עדכן תזמון לכל הטיוטות</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-foreground">תאריך ושעת פרסום</label>
                      <input
                        type="datetime-local"
                        value={(() => {
                          if (!bulkScheduleIso) return '';
                          const d = new Date(bulkScheduleIso);
                          if (Number.isNaN(d.getTime())) return '';
                          const pad = (n: number) => String(n).padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        })()}
                        min={(() => {
                          const floor = new Date(Date.now() + 60_000);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          return `${floor.getFullYear()}-${pad(floor.getMonth() + 1)}-${pad(floor.getDate())}T${pad(floor.getHours())}:${pad(floor.getMinutes())}`;
                        })()}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) {
                            const d = new Date(v);
                            if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
                              setBulkScheduleIso(d.toISOString());
                            } else {
                              setBulkScheduleIso(null);
                            }
                          } else {
                            setBulkScheduleIso(null);
                          }
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        dir="ltr"
                      />
                    </div>
                    <DialogFooter className="sm:justify-start">
                      <Button type="button" onClick={() => setBulkScheduleDialogOpen(false)}>אישור</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Global campaign scheduler — distributes all drafts across groups and time slots. */}
                <Dialog open={bulkGlobalScheduleOpen} onOpenChange={setBulkGlobalScheduleOpen}>
                  <DialogContent dir="rtl" className="w-[96vw] sm:max-w-5xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-right">תזמון קמפיין לכל הטיוטות</DialogTitle>
                    </DialogHeader>
                    <ScheduledCampaignCalendar
                      initialDay={new Date()}
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
                        if (extras?.assignments) {
                          try { sessionStorage.setItem('rz-schedule-assignments', JSON.stringify(extras.assignments)); } catch {}
                        }
                        if (extras?.groupIds && extras.groupIds.length > 0) {
                          saveCampaignGroups(workspaceOwnerId, extras.groupIds);
                          setBulkGroupIds(extras.groupIds);
                        }
                        setBulkGlobalScheduleOpen(false);
                        setSearchParams(next, { replace: false });
                      }}
                      onClose={() => setBulkGlobalScheduleOpen(false)}
                    />
                  </DialogContent>
                </Dialog>

                <Dialog open={bulkGroupPickerOpen} onOpenChange={setBulkGroupPickerOpen}>
                  <DialogContent dir="rtl" className="w-[96vw] sm:max-w-[720px]">
                    <DialogHeader>
                      <DialogTitle className="text-right">קבוצות לכל הטיוטות</DialogTitle>
                    </DialogHeader>
                    <CampaignGroupSelector selectedIds={bulkGroupIds} onChange={setBulkGroupIds} />
                    <DialogFooter className="sm:justify-start">
                      <Button type="button" onClick={() => setBulkGroupPickerOpen(false)}>
                        אישור{bulkGroupIds.length > 0 ? ` (${bulkGroupIds.length})` : ''}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            );
          })()}

        </TabsContent>
        <TabsContent value="published" className="mt-6">
          
          <PublishedFeed subTab={historyTab} onSubTabChange={setHistoryTab} altContent={queueAltContent} />
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
                saveCampaignGroups(workspaceOwnerId, extras.groupIds);
                setBulkGroupIds(extras.groupIds);
              }
              setSearchParams(next, { replace: false });
            }}
            onClose={() => handleChange('published')}
          />
        </TabsContent>
      </Tabs>


      <EditScheduledSeriesDialog
        open={!!editSeriesRow}
        onOpenChange={(v) => { if (!v) setEditSeriesRow(null); }}
        row={editSeriesRow}
        onUpdated={() => setHistoryRefreshTick((t) => t + 1)}
      />

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
        publishToPage={(confirmPayload as any)?.publish_to_page !== false}
        selectedProfileIds={confirmPayload?.selected_profile_ids ?? []}
        attachWaLink={confirmPayload?.attach_wa_link ?? false}
        firstComment={confirmPayload?.first_comment ?? ''}
        autoConfirm={bulkSilent}

        onConfirmed={async () => {
          const body = confirmPayload?.body ?? '';
          const shouldEmail = alsoEmail && pickedChannel?.id !== 'email' && connectedChannels.has('email') && body.trim().length > 0;
          const publishedChannelId = pickedChannel?.id;
          // Multi-draft mode: only the dispatched draft is retired — the other
          // drafts (and the channel) must stay exactly as they are.
          const draftKey = activeDraftKeyRef.current;
          activeDraftKeyRef.current = null;
          if (draftKey) {
            setConfirmPayload(null);
            retirePublishedDraft(draftKey, publishedChannelId);
            setHistoryRefreshTick((t) => t + 1);
            if (publishedChannelId) {
              try {
                sweepComposerDraftKeys(publishedChannelId, draftKey);
              } catch {}
            }
            toast.success('הטיוטה פורסמה');
            advanceBulkQueue();
            return;
          }
          setConfirmPayload(null);
          setPickedChannel(null);
          setPickedChannelIds(new Set());
          // Force-remount InlineComposer so body + selected property + media
          // fully reset, then jump to the sent-campaigns feed so the user
          // immediately sees the freshly logged row.
          setComposerResetTick((t) => t + 1);
          handleChange('published');
          if (publishedChannelId) {
            try {
              // After a submit the composer text area starts empty again: every
              // saved draft entry for this channel is swept from both stores.
              sweepComposerDraftKeys(publishedChannelId);
              sessionStorage.removeItem('rz-schedule-assignments');
            } catch {}
            // Only a published post retires the durable session mirror.
            setRestoredSession(null);
            void clearComposerSession(publishedChannelId);
            void clearComposerDraftsCloud(publishedChannelId);
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
      <SupportRequiredDialog
        channelLabel={supportChannel}
        open={!!supportChannel}
        onOpenChange={(v) => { if (!v) setSupportChannel(null); }}
      />

    </div>
  );
};


export default CampaignCenter;
