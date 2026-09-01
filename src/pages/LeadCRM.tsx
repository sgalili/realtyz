import SmartTimelineCard from '@/components/SmartTimelineCard';
import QuickMessageCard from '@/components/messaging/QuickMessageCard';

import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OutcomePicker, OutcomeBadge, type InteractionOutcome } from '@/components/dealroom/OutcomePicker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search, CheckCircle2, XCircle, User, MapPin, Tag, Clock,
  ArrowUpRight, ArrowDownLeft, Upload, FileSpreadsheet, AlertTriangle,
  Users, Download, Megaphone, Trash2, X, Sparkles, Eye, SlidersHorizontal,
  Heart, MessageCircle, UserPlus, Bot, Map, Smile, Meh, Frown,
  Wallet, Compass, Radio, Target, Home as HomeIcon, Phone as PhoneIcon, Mail,
  Loader2, Pencil, Check
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { parsePdfToRows } from '@/lib/parsePdfTable';
import { sendToN8n } from '@/lib/n8nService';
import { formatPhoneDisplay, isValidIsraeliPhone } from '@/lib/formatPhone';
import VoterAvatar from '@/components/VoterAvatar';
import LeadProfilePictureMenu from '@/components/leads/LeadProfilePictureMenu';
import { BrandIcon } from '@/components/BrandIcon';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { getDemoCandidateMessages, getDemoCandidateVoters } from '@/lib/demoData';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer
} from 'recharts';
import NewLeadDialog from '@/components/leads/NewLeadDialog';
import LeadEnrichmentPanel, { LeadEnrichmentButton, LeadEnrichmentIconButton } from '@/components/leads/LeadEnrichmentPanel';
import { useFreemiumStatus } from '@/hooks/useFreemiumStatus';
import { PriceTag } from '@/components/PriceTag';
import { Rows, Rows3, Home, Building2, Plus, Upload as UploadIcon, UserRoundPlus, DownloadCloud } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { HomelyBulkSyncDialog } from '@/components/properties/HomelyBulkSyncDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import OwnerPropertyGrid from '@/components/leads/OwnerPropertyGrid';

/**
 * isOwnerLead — Sellers and Landlords are property OWNERS, not seekers.
 * Their profile must show property data (the 13 Homely columns) instead
 * of buyer/renter preferences like preferred area or requested budget.
 */
function isOwnerLead(lead: any): boolean {
  const kind = lead?.preferences?.lead_kind;
  if (kind === 'seller' || kind === 'landlord') return true;
  // deal_type 'sell' = listing for sale by owner
  if (lead?.deal_type === 'sell') return true;
  return false;
}

/**
 * Map a numeric budget (preferences.budget_max) to the CRM dropdown token so a
 * budget captured by chat/WhatsApp intake shows up pre-selected.
 * Kept in sync with the budget option lists in the profile sheet.
 */
function budgetTokenFromAmount(amount: number, isRental: boolean): string {
  const v = Number(amount ?? 0);
  if (!isFinite(v) || v <= 0) return '';
  if (isRental) {
    if (v <= 3500) return '0-3500';
    if (v <= 5000) return '3500-5000';
    if (v <= 7000) return '5000-7000';
    if (v <= 10000) return '7000-10000';
    if (v <= 15000) return '10000-15000';
    return '15000+';
  }
  if (v <= 1500000) return '0-1500000';
  if (v <= 2500000) return '1500000-2500000';
  if (v <= 4000000) return '2500000-4000000';
  if (v <= 6000000) return '4000000-6000000';
  if (v <= 10000000) return '6000000-10000000';
  return '10000000+';
}

/** Hebrew display dictionary for the "ערוץ הגעה" (source) dropdown. */
const SOURCE_LABEL_HE: Record<string, string> = {
  webtiv_stream: 'סטרים ובטיב',
  webtiv: 'ובטיב',
  homely: 'הומלי',
  shortlink: 'פוסט פייסבוק',
  facebook: 'פייסבוק',
  facebook_groups: 'פייסבוק קבוצות',
  instagram: 'אינסטגרם',
  whatsapp: 'וואטסאפ',
  inbound_call: 'שיחה נכנסת',
  yad2: 'יד2',
  website: 'אתר',
  manual: 'הוזן ידנית',
};

/** Hebrew display dictionary for the "סטטוס לקוח" (lead_stage) dropdown. */
const STAGE_LABEL_HE: Record<string, string> = {
  new: 'מתעניין חדש',
  new_lead: 'מתעניין חדש',
  contacted: 'יצר קשר',
  engaging: 'בטיפול',
  cold: 'מתעניין קר',
  qualified: 'מתעניין מוסמך',
  touring: 'בסיור נכסים',
  offer_pending: 'ממתין להצעה',
  negotiation: 'במשא ומתן',
  closed: 'סגר עסקה',
};

// Strict Israeli mobile cleaner. Returns 9725XXXXXXXX (12 digits) for storage, or null if invalid.
// Rules per spec:
//  1) Strip every non-digit (spaces, dots, hyphens, parens, plus, etc.)
//  2) Leading "972" → replace with "0"   (handles +972 and 972)
//  3) Leading "5" without 0 → prepend "0"
//  4) Final local form must be exactly 10 digits and start with 05
function normalizeIsraeliPhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('5') && digits.length === 9) digits = '0' + digits;
  if (!/^05\d{8}$/.test(digits)) return null;
  // Store in international form for consistency with existing rows
  return '972' + digits.slice(1);
}


const interestHebrew: Record<string, string> = {
  Security: 'ביטחון', Economy: 'כלכלה', 'Legal/Judicial': 'משפט',
  Legal: 'משפט', Campaign: 'קמפיין', 'Smart Link': 'קישור חכם', Engagement: 'מעורבות',
};
const statusHebrew: Record<string, string> = {
  // Real-estate CRM lead statuses (Hebrew only in the UI)
  new: 'מתעניין חדש',
  lead: 'מתעניין חדש',
  cold: 'מתעניין קר',
  qualified: 'מתעניין מוסמך',
  negotiation: 'במשא ומתן',
  closed: 'נסגרה עסקה',
  // Legacy fallbacks
  supporter: 'נסגרה עסקה', active: 'מתעניין מוסמך',
  inactive: 'לא רלוונטי כרגע', contacted: 'נוצר קשר', voted: 'נסגרה עסקה',
};
/** Hebrew display dictionary for the sentiment ("יחס הלקוח") filter. */
const SENTIMENT_LABEL_HE: Record<string, string> = {
  positive: 'חיובי',
  neutral: 'ניטרלי',
  negative: 'שלילי',
};

const loyaltyConfig: Record<string, { label: string; color: string }> = {
  cold: { label: 'מתעניין קר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
  qualified: { label: 'מתעניין מוסמך', color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  negotiation: { label: 'במשא ומתן', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  closed: { label: 'נסגר', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
  // Legacy
  supporter: { label: 'נסגר', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
  active: { label: 'מתעניין מוסמך', color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  lead: { label: 'מתעניין קר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
  inactive: { label: 'לא רלוונטי', color: 'bg-red-500/15 text-red-700 border-red-300' },
  contacted: { label: 'נוצר קשר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
  voted: { label: 'נסגר', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
};
const hebrewLabel = (map: Record<string, string>, val: string | null | undefined) =>
  val ? map[val] || val : null;

const radarAxisLabels: Record<string, string> = {
  security: 'ביטחון', economy: 'כלכלה', judicial: 'משפט', social: 'חברה', governance: 'ממשל',
};

const demoInterestOptions = ['ביטחון', 'כלכלה', 'חינוך', 'בריאות', 'תחבורה', 'סביבה', 'דיור', 'תרבות'];

interface ImportRow {
  full_name: string;
  phone_number: string;
  city?: string;
  interest_tag?: string;
  identity_number?: string;
  email?: string;
  /** All ORIGINAL columns from the source file (header → value), so we never
   * lose data the agent might want later (budget, neighborhood, source, etc.). */
  extra?: Record<string, string>;
}

// Bilingual header mapping (Hebrew + English). Keys are normalized (lowercased, trimmed, quotes stripped)
const HEADER_ALIASES: Record<string, string[]> = {
  first_name: ['first name', 'firstname', 'private name', 'given name', 'שם פרטי', 'שם_פרטי'],
  last_name: ['last name', 'lastname', 'family name', 'surname', 'שם משפחה', 'שם_משפחה', 'משפחה'],
  full_name: ['full name', 'fullname', 'name', 'שם', 'שם מלא', 'full_name'],
  phone: ['phone', 'mobile', 'phone number', 'cell', 'cellphone', 'mobile number', 'טלפון', 'סלולרי', 'נייד', 'מס טלפון', 'מס טלפון 1', 'מספר טלפון', 'phone_number'],
  email: ['email', 'e-mail', 'mail', 'אימייל', 'דוא"ל', 'דואל', 'דואר אלקטרוני'],
  city: ['city', 'town', 'locality', 'עיר', 'יישוב', 'ישוב'],
  identity_number: ['id', 'id number', 'identity number', 'national id', 'ת.ז', 'תז', 'מספר זהות', 'תעודת זהות', 'identity_number'],
  interest_tag: ['interest', 'tag', 'topic', 'נושא', 'נושא עניין', 'תג', 'interest_tag'],
};

function normalizeHeader(h: string): string {
  return String(h ?? '')
    .replace(/["'`]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildHeaderMap(headers: string[]): Record<string, string> {
  // Returns: { canonicalField: actualHeaderInFile }
  const map: Record<string, string> = {};
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const hit = normalized.find((h) => aliasSet.has(h.norm));
    if (hit) map[field] = hit.raw;
  }
  return map;
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

const CircularScore = ({ score }: { score: number }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? 'hsl(var(--success))' : score >= 30 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">מתוך 100</span>
      </div>
    </div>
  );
};

const PAGE_SIZE = 50;

const CRM_MESSAGE_CHANNELS = [
  { key: 'whatsapp', brand: 'whatsapp', label: 'WhatsApp', textClass: 'text-social-whatsapp' },
  { key: 'messenger', brand: 'messenger', label: 'Messenger', textClass: 'text-social-messenger' },
  { key: 'instagram', brand: 'instagram', label: 'Instagram', textClass: 'text-social-instagram' },
  { key: 'linkedin', brand: 'linkedin', label: 'LinkedIn', textClass: 'text-social-linkedin' },
  { key: 'x', brand: 'x', label: 'X', textClass: 'text-social-x' },
  { key: 'tiktok', brand: 'tiktok', label: 'TikTok', textClass: 'text-social-tiktok' },
  { key: 'telegram', brand: 'telegram', label: 'Telegram', textClass: 'text-social-telegram' },
  { key: 'sms', brand: null, label: 'SMS', textClass: 'text-social-sms' },
  { key: 'email', brand: null, label: 'Email', textClass: 'text-social-email' },
] as const;

function socialHandleFromLead(lead: any, platform: string): string | null {
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
    platform === 'youtube' ? (lead?.youtube_handle || prefs.youtube_url || fromArr) :
    platform === 'telegram' ? (lead?.telegram_username || fromArr) :
    null;
  return value ? String(value) : null;
}

function EditableInlineText({
  value,
  placeholder,
  onSave,
  validate,
  inputMode,
  dir,
  className,
  ariaLabel,
}: {
  value: string;
  placeholder: string;
  onSave: (next: string) => Promise<void> | void;
  validate?: (v: string) => string | null;
  inputMode?: 'text' | 'tel' | 'email';
  dir?: 'rtl' | 'ltr';
  className?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === value.trim()) { setEditing(false); return; }
    const err = validate?.(trimmed);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(value); }
          }}
          inputMode={inputMode}
          dir={dir}
          placeholder={placeholder}
          className={`h-7 text-sm ${className || ''}`}
        />
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-emerald-600" onClick={commit} disabled={saving} aria-label="שמור">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => { setEditing(false); setDraft(value); }} aria-label="ביטול">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`group inline-flex items-center gap-1 text-right hover:text-primary transition-colors ${className || ''}`}
      aria-label={ariaLabel}
      dir={dir}
    >
      <span className="truncate">{value || placeholder}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />
    </button>
  );
}


const LeadCRM = () => {
  const { user } = useAuth();
  const activeWorkspaceId = useActiveWorkspaceOwnerId();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const blockDemoAction = useDemoGuard();
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Check admin role
  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc('has_role', { _user_id: user!.id, _role: 'admin' });
      return !!data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const [search, setSearch] = useState('');
  const [interestFilter, setInterestFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [profileFilter, setProfileFilter] = useState<string>('all');
  const [dealTypeFilter, setDealTypeFilter] = useState<string>('all');
  const [leadKindFilter, setLeadKindFilter] = useState<'all' | 'buyer' | 'seller' | 'renter' | 'landlord'>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    try { return localStorage.getItem('crm.compact') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('crm.compact', compactMode ? '1' : '0'); } catch {}
  }, [compactMode]);
  const freemium = useFreemiumStatus();
  const { leadId: routeLeadId } = useParams<{ leadId?: string }>();
  const navigate = useNavigate();
  const [selectedVoterId, setSelectedVoterId] = useState<string | null>(routeLeadId ?? null);

  // Sync sheet open-state with the URL param so /lead-crm/:id opens the profile.
  useEffect(() => {
    if (routeLeadId && routeLeadId !== selectedVoterId) setSelectedVoterId(routeLeadId);
    if (!routeLeadId && selectedVoterId) setSelectedVoterId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLeadId]);
  const [statusInfoOpen, setStatusInfoOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [homelyContactsSyncOpen, setHomelyContactsSyncOpen] = useState(false);
  const [homelySyncing, setHomelySyncing] = useState(false);

  const handleHomelySync = async () => {
    if (homelySyncing) return;
    setHomelySyncing(true);
    window.dispatchEvent(new Event('leads:busy:on'));
    const t = toast.loading('מסנכרן מתעניינים מהומלי...');
    try {
      const { data, error } = await supabase.functions.invoke('homely-leads', { body: { wipe_first: true } });
      if (error) throw error;
      const imported = (data as any)?.imported ?? 0;
      const note = (data as any)?.note;
      if (!(data as any)?.connected) {
        const desc = note === 'no_credentials' ? 'הגדר אישורי Homely בהגדרות API'
          : note === 'no_password' ? 'סיסמת Homely חסרה'
          : note === 'missing_guids' ? 'תצורת סנכרון Webtiv חסרה — אין GUID של קונים/מוכרים. עדכן בהגדרות.'
          : (data as any)?.error || 'בדוק אישורים בהגדרות';
        toast.error('Homely לא מחובר', { id: t, description: desc });
      } else {
        const total = (data as any)?.total ?? 0;
        const skipped = (data as any)?.skipped ?? 0;
        toast.success('הסנכרון מול Homely הושלם בהצלחה!', { id: t, description: imported ? `נוספו ${imported} רשומות (סה"כ ${total}, דילוג ${skipped})` : `אין רשומות חדשות (נסרקו ${total})` });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads-infinite'] }),
        queryClient.invalidateQueries({ queryKey: ['leads-total'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox-chats'] }),
      ]);
    } catch (e: any) {
      toast.error('סנכרון Homely נכשל', { id: t, description: e?.message ?? String(e) });
    } finally {
      setHomelySyncing(false);
      window.dispatchEvent(new Event('leads:busy:off'));
    }
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportRow[]>([]);
  const [importStats, setImportStats] = useState<{ total: number; valid: number; duplicates: number; invalid: number; healthPct: number; detectedFields: string[]; missingPhone: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  // Lead kind selected by the agent BEFORE confirming an import. Drives deal_type
  // and preferences.lead_kind on every inserted row so buyers/sellers/renters/landlords
  // stay in the right pipeline from day one.
  const [importLeadKind, setImportLeadKind] = useState<'buyer' | 'seller' | 'renter' | 'landlord'>('buyer');
  const [addToCampaignOpen, setAddToCampaignOpen] = useState(false);
  const [aiBlastOpen, setAiBlastOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiPreviews, setAiPreviews] = useState<Array<{ name: string; message: string }>>([]);
  const [addVoterOpen, setAddVoterOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [deletingSingle, setDeletingSingle] = useState(false);
  const [newVoter, setNewVoter] = useState({ full_name: '', phone_number: '', city: '', identity_number: '', instagram_handle: '', telegram_username: '' });
  const [addingVoter, setAddingVoter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importIsJson, setImportIsJson] = useState(false);
  const queryClient = useQueryClient();

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Listen for hero-emitted add events (the '+' button lives in PageHero now).
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: 'manual' | 'import' | 'homely' }>).detail?.action;
      if (action === 'manual') setAddVoterOpen(true);
      else if (action === 'import') fileInputRef.current?.click();
      else if (action === 'homely') handleHomelySync();
    };
    window.addEventListener('leads:add', handler);
    return () => window.removeEventListener('leads:add', handler);
  }, []);

  useRealtimeSubscription('messages', [['lead-messages', selectedVoterId ?? '']]);

  // Server-side paginated + filtered query
  const {
    data: voterPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['leads-infinite', debouncedSearch, interestFilter, cityFilter, statusFilter, dealTypeFilter, leadKindFilter, sentimentFilter, channelFilter],
    enabled: !isDemoMode,
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase.from('leads').select('*', { count: 'exact' });

      // Broad multi-field search: match any partial value across name, phone,
      // email, city, address, neighborhood, identity, social handles, tags.
      // Falls back to tsvector when the query is complex.
      if (debouncedSearch.trim()) {
        const raw = debouncedSearch.trim().replace(/[,()]/g, ' ').trim();
        const like = `*${raw}*`;
        const digits = raw.replace(/\D/g, '');
        const conds = [
          `full_name.ilike.${like}`,
          `email.ilike.${like}`,
          `city.ilike.${like}`,
          `address.ilike.${like}`,
          `neighborhood.ilike.${like}`,
          `identity_number.ilike.${like}`,
          `interest_tag.ilike.${like}`,
          `status.ilike.${like}`,
          `instagram_handle.ilike.${like}`,
          `telegram_username.ilike.${like}`,
        ];
        if (digits.length >= 3) conds.push(`phone_number.ilike.*${digits}*`);
        query = query.or(conds.join(','));
      }
      if (interestFilter !== 'all') query = query.eq('interest_tag', interestFilter);
      if (cityFilter !== 'all') query = query.eq('city', cityFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (dealTypeFilter !== 'all') query = query.eq('deal_type', dealTypeFilter);
      if (leadKindFilter !== 'all') query = query.eq('preferences->>lead_kind', leadKindFilter);
      if (sentimentFilter !== 'all') query = query.eq('sentiment', sentimentFilter);
      if (channelFilter !== 'all') query = query.eq('preferences->>arrival_channel', channelFilter);

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0, page: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1;
      return nextPage * PAGE_SIZE < lastPage.total ? nextPage : undefined;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 30_000,    // 30s polling for non-critical updates
  });

  // Blank/placeholder rows from the legacy "create empty lead" flow are never
  // shown: no real phone number and the stock "לקוח חדש" name.
  const isBlankPlaceholderLead = (v: any) =>
    String(v?.phone_number ?? '').startsWith('new-') ||
    (String(v?.full_name ?? '').trim() === 'לקוח חדש' &&
      !String(v?.email ?? '').trim() &&
      !String(v?.city ?? '').trim());
  const dbVoters = useMemo(
    () => (voterPages?.pages.flatMap(p => p.rows) ?? []).filter((v) => !isBlankPlaceholderLead(v)),
    [voterPages],
  );
  const demoVoters = useMemo(() => getDemoCandidateVoters(demoCandidateId), [demoCandidateId]);
  const demoMessages = useMemo(() => getDemoCandidateMessages(demoCandidateId), [demoCandidateId]);
  const leads = useMemo(() => {
    if (!isDemoMode) return dbVoters;
    const demoIds = new Set(demoVoters.map((v) => v.id));
    return [...demoVoters, ...dbVoters.filter((v) => !demoIds.has(v.id))] as typeof dbVoters;
  }, [isDemoMode, dbVoters, demoVoters]);
  const totalCount = isDemoMode ? Math.max(1_000_000, leads.length) : (voterPages?.pages[0]?.total ?? 0);

  // Hydrate WhatsApp avatars for the rows actually on screen. Each lead is
  // attempted once per session so scrolling never re-hammers the edge function.
  const avatarTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isDemoMode) return;
    const missing = leads
      .filter((l: any) => !l.profile_picture_url && l.phone_number && !avatarTried.current.has(l.id))
      .map((l: any) => l.id as string)
      .slice(0, 50);
    if (!missing.length) return;
    missing.forEach((id) => avatarTried.current.add(id));
    const t = window.setTimeout(() => {
      supabase.functions
        .invoke('fetch-wa-avatars', { body: { lead_ids: missing, owner_id: activeWorkspaceId } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['leads-infinite'] }))
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(t);
  }, [leads, isDemoMode, queryClient, activeWorkspaceId]);



  // Discover extra columns dynamically from imported preferences.extra_fields.
  // Keep keys that don't duplicate an already-shown native column, ordered by frequency.
  const SKIP_EXTRA_KEYS = new Set([
    'שם', 'שם מלא', 'full name', 'fullname', 'name',
    'טלפון', 'טלפון1', 'טלפון 1', 'phone', 'mobile', 'נייד', 'סלולרי',
    'עיר', 'city',
  ].map((s) => s.toLowerCase().trim()));
  const extraColumns = useMemo<string[]>(() => {
    const counts: Record<string, number> = {};
    for (const lead of leads) {
      const ex = (lead as any).preferences?.extra_fields;
      if (!ex || typeof ex !== 'object') continue;
      for (const k of Object.keys(ex)) {
        if (SKIP_EXTRA_KEYS.has(k.toLowerCase().trim())) continue;
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);
  }, [leads]);
  const baseColCount = 6;

  // Owner-only Homely columns. Only injected when the agent has filtered the
  // table to sellers or landlords (property owners). Each column is rendered
  // from the linked `listings` row referenced by `leads.linked_listing_id`.
  const isOwnerView = leadKindFilter === 'seller' || leadKindFilter === 'landlord';
  // Owner view: keep ONLY contact-profile related columns. Property structural
  // columns (rooms/price/floor/elevator/city/street/area/house_no) live in the
  // Properties table — never duplicate them in the contacts dashboard.
  const HOMELY_OWNER_COLUMNS: { key: string; label: string; render: (l: any) => string }[] = [
    { key: 'agent',   label: 'סוכן',   render: (l) => l.__listing?.source_metadata?.agent ?? '-' },
    { key: 'updated', label: 'עדכון',  render: (l) => l.__listing?.updated_at ? format(new Date(l.__listing.updated_at), 'dd/MM/yy') : '-' },
  ];

  // Hydrate the visible owner leads with their linked listing rows in ONE query.
  const ownerLinkedIds = useMemo(() => {
    if (!isOwnerView) return [] as string[];
    const ids = new Set<string>();
    for (const l of leads as any[]) if (l?.linked_listing_id) ids.add(l.linked_listing_id);
    return Array.from(ids);
  }, [isOwnerView, leads]);
  const { data: ownerListings } = useQuery({
    queryKey: ['owner-listings-bulk', ownerLinkedIds.sort().join(',')],
    enabled: ownerLinkedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('listings').select('*').in('id', ownerLinkedIds);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const row of data ?? []) map[row.id] = row;
      return map;
    },
    staleTime: 30_000,
  });
  const listingsById: Record<string, any> = ownerListings ?? {};

  const totalColCount = baseColCount + extraColumns.length + (isOwnerView ? HOMELY_OWNER_COLUMNS.length : 0);

  // Lightweight query for filter options (distinct values)
  const { data: filterOptions } = useQuery({
    queryKey: ['lead-filter-options'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('city, interest_tag, status, sentiment, preferences');
      const cities = [...new Set((data ?? []).map(v => v.city).filter(Boolean))];
      const interests = [...new Set((data ?? []).map(v => v.interest_tag).filter(Boolean))];
      const statuses = [...new Set((data ?? []).map(v => v.status).filter(Boolean))];
      const sentiments = [...new Set((data ?? []).map(v => v.sentiment).filter(Boolean))];
      const channels = [...new Set((data ?? []).map(v => (v.preferences as any)?.arrival_channel).filter(Boolean))] as string[];
      return { cities, interests, statuses, sentiments, channels };
    },
    staleTime: 10 * 60 * 1000,
  });

  // Unfiltered total - reflects ALL real leads in the user's account
  const { data: realTotalCount = 0 } = useQuery({
    queryKey: ['leads-total'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60_000,
  });
  const uniqueCities = isDemoMode
    ? [...new Set([...demoVoters.map((v) => v.city).filter(Boolean), ...(filterOptions?.cities ?? [])])]
    : filterOptions?.cities ?? [];
  const uniqueInterests = isDemoMode
    ? [...new Set([...demoInterestOptions, ...(filterOptions?.interests ?? [])])]
    : filterOptions?.interests ?? [];
  const uniqueStatuses = isDemoMode
    ? [...new Set([...demoVoters.map((v) => v.status).filter(Boolean), ...(filterOptions?.statuses ?? [])])]
    : filterOptions?.statuses ?? [];

  const { data: voterMessages } = useQuery({
    queryKey: ['lead-messages', selectedVoterId],
    enabled: !!selectedVoterId && !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase.from('messages').select('*').eq('lead_id', selectedVoterId!).order('created_at', { ascending: true });
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: voterChatHistory } = useQuery({
    queryKey: ['lead-chat-history', selectedVoterId],
    enabled: !!selectedVoterId && !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase.from('chat_history').select('*').eq('lead_id', selectedVoterId!).order('created_at', { ascending: true });
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data } = await supabase.from('campaigns').select('*');
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedVoter = leads?.find((v) => v.id === selectedVoterId);
  const activeVoterMessages = (isDemoMode && selectedVoterId?.startsWith('demo-lead-')
    ? demoMessages.filter((m) => m.lead_id === selectedVoterId)
    : voterMessages) as any[];
  const activeVoterChatHistory = isDemoMode && selectedVoterId?.startsWith('demo-lead-')
    ? demoMessages.filter((m) => m.lead_id === selectedVoterId)
    : voterChatHistory;

  // Auto-fill lead dropdowns from messages + chat history (heuristic, runs once per lead)
  const autoFilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedVoter?.id) return;
    if (autoFilledRef.current.has(selectedVoter.id)) return;
    const msgs = (activeVoterMessages ?? []).map((m: any) => String(m?.content ?? ''));
    const chats = (activeVoterChatHistory ?? []).map((c: any) => String(c?.content ?? ''));
    const corpus = [...msgs, ...chats].join(' \n ').toLowerCase();
    if (!corpus.trim()) return;

    const prefs = ((selectedVoter as any).preferences ?? {}) as Record<string, any>;
    const patch: Record<string, any> = {};
    const prefPatch: Record<string, any> = {};

    // deal_type
    if (!(selectedVoter as any).deal_type) {
      if (/(שכירות|להשכרה|לשכור|שוכר)/.test(corpus)) patch.deal_type = 'rent';
      else if (/(להשקעה|תשואה|השקעה)/.test(corpus)) patch.deal_type = 'investment';
      else if (/(למכור|מוכר|מכירה)/.test(corpus)) patch.deal_type = 'sell';
      else if (/(לקנות|קונה|רכישה|לרכוש|קנייה)/.test(corpus)) patch.deal_type = 'sale';
    }
    // source
    if (!prefs.source && !prefs.lead_source && !(selectedVoter as any).source) {
      if (/yad2|יד2/.test(corpus)) prefPatch.source = 'yad2';
      else if (/instagram|אינסטגרם/.test(corpus)) prefPatch.source = 'instagram';
      else if (/facebook|פייסבוק/.test(corpus)) prefPatch.source = 'facebook';
      else if (/whatsapp|וואטסאפ|וואצאפ/.test(corpus)) prefPatch.source = 'whatsapp';
    }
    // property_type
    if (!prefs.property_type && !prefs.listing_type) {
      if (/פנטהאוז|penthouse/.test(corpus)) prefPatch.property_type = 'penthouse';
      else if (/קוטג|cottage/.test(corpus)) prefPatch.property_type = 'cottage';
      else if (/בית פרטי|וילה|villa/.test(corpus)) prefPatch.property_type = 'house';
      else if (/סטודיו|studio/.test(corpus)) prefPatch.property_type = 'studio';
      else if (/משרד|office/.test(corpus)) prefPatch.property_type = 'office';
      else if (/דירה|apartment/.test(corpus)) prefPatch.property_type = 'apartment';
    }
    // budget_range — extract first numeric amount with ₪/שקל/מיליון/k context
    if (!prefs.budget_range) {
      let amount = 0;
      const m1 = corpus.match(/(\d+(?:[.,]\d+)?)\s*(?:מיליון|m\b|מ׳)/);
      const m2 = corpus.match(/(\d{6,9})/);
      if (m1) amount = parseFloat(m1[1].replace(',', '.')) * 1_000_000;
      else if (m2) amount = parseInt(m2[1], 10);
      if (amount > 0) {
        prefPatch.budget_range =
          amount < 1_500_000 ? '0-1500000' :
          amount < 2_500_000 ? '1500000-2500000' :
          amount < 4_000_000 ? '2500000-4000000' :
          amount < 6_000_000 ? '4000000-6000000' :
          amount < 10_000_000 ? '6000000-10000000' : '10000000+';
      }
    }
    // neighborhood / city
    if (!(selectedVoter as any).neighborhood) {
      const cities = ['תל אביב','רמת גן','גבעתיים','הרצליה','רמת השרון','רעננה','כפר סבא','נתניה','ראשון לציון','חיפה','ירושלים','באר שבע','צמרות','הרצליה הצעירה'];
      const hit = cities.find(c => corpus.includes(c.toLowerCase()));
      if (hit) patch.neighborhood = hit;
    }
    // lead_stage — escalate if scheduling/negotiation talk appears
    if (!(selectedVoter as any).lead_stage) {
      if (/(חוזה|עורך דין|הצעת מחיר|מ"מ|משא ומתן)/.test(corpus)) patch.lead_stage = 'negotiation';
      else if (/(סיור|לראות|לבקר|פגישה|תיאום)/.test(corpus)) patch.lead_stage = 'touring';
      else if (msgs.length + chats.length >= 3) patch.lead_stage = 'qualified';
    }

    if (Object.keys(prefPatch).length) patch.preferences = { ...prefs, ...prefPatch };
    if (!Object.keys(patch).length) { autoFilledRef.current.add(selectedVoter.id); return; }

    autoFilledRef.current.add(selectedVoter.id);
    (async () => {
      const { error } = await supabase.from('leads').update(patch as any).eq('id', selectedVoter.id);
      if (!error) queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVoter?.id, activeVoterMessages?.length, activeVoterChatHistory?.length]);

  const filtered = useMemo(() => {
    if (!leads) return leads;
    if (profileFilter === 'all') return leads;
    return leads.filter((v) => {
      // Mirror getPoliticalProfile (real-estate lead stage)
      const status = v.status;
      const tier =
        status === 'closed' || status === 'supporter' || status === 'voted' ? 'closed'
        : status === 'negotiation' ? 'negotiation'
        : status === 'qualified' || status === 'active' ? 'qualified'
        : 'cold';
      const badge =
        tier === 'closed' ? 'נסגר'
        : tier === 'negotiation' ? 'במשא ומתן'
        : tier === 'qualified' ? 'מתעניין מוסמך'
        : 'מתעניין קר';
      return badge === profileFilter;
    });
  }, [leads, profileFilter]);

  const getScoreColor = (score: number | null) => {
    if (!score || score < 30) return 'bg-red-500/10 text-red-600';
    if (score < 60) return 'bg-amber-500/10 text-amber-600';
    return 'bg-emerald-500/10 text-emerald-600';
  };

  const getLoyalty = (status: string | null) => loyaltyConfig[status || 'lead'] || loyaltyConfig.lead;

  const getSentimentForVoter = (score: number | null) => {
    const s = score ?? 0;
    if (s >= 60) return { key: 'positive' as const, emoji: '😊', label: 'חיובי', color: 'text-emerald-600', cssColor: 'hsl(var(--success))' };
    if (s >= 30) return { key: 'neutral' as const, emoji: '😐', label: 'ניטרלי', color: 'text-orange-500', cssColor: 'hsl(25 95% 53%)' };
    return { key: 'negative' as const, emoji: '😟', label: 'שלילי', color: 'text-red-600', cssColor: 'hsl(var(--destructive))' };
  };

  // Derive a 0-100 lead-temperature score from every signal we already have on
  // the row: AI-computed engagement_score (primary), recent message activity,
  // and the broker's office notes (homely_notes / preferences.summary) — the
  // ingested "הערות משרד" feed gives us strong intent signals that the DB
  // score may not yet reflect.
  const computeLeadTemp = (lead: any): number => {
    const base = Number(lead?.engagement_score ?? 0);
    let bonus = 0;
    const prefs = (lead?.preferences ?? {}) as Record<string, any>;
    const raw = (prefs.homely_raw ?? {}) as Record<string, any>;
    const notes = String(prefs.homely_notes ?? prefs.summary ?? lead?.notes ?? raw.comments1 ?? '');
    if (notes.length > 0) bonus += Math.min(20, Math.ceil(notes.length / 40));
    if (/בלעדי|חתימה|מ"מ|משא ומתן|negotiation|סגור|חתום/i.test(notes)) bonus += 25;
    if (/לא רלוונטי|לא מעוניין|לא עובד/i.test(notes)) bonus -= 30;
    // Homely / KB intent signals (budget, search criteria, assigned broker)
    if (prefs.budget_max || prefs.desired_city || prefs.rooms || prefs.budget_range) bonus += 10;
    if (Number(raw.priceshekel) > 0 || Number(raw.priceshekel_max) > 0) bonus += 12;
    if (raw.room || raw.objectresidence || raw.shcuna1) bonus += 6;
    if (raw.agent && String(raw.agent).trim()) bonus += 8;       // assigned office manager
    if (lead?.last_contact_at) {
      const ageDays = (Date.now() - new Date(lead.last_contact_at).getTime()) / 86_400_000;
      if (ageDays < 3) bonus += 15; else if (ageDays > 30) bonus -= 10;
    }
    const lastDate = raw.lastdate ? new Date(raw.lastdate).getTime() : null;
    if (lastDate) {
      const ageDays = (Date.now() - lastDate) / 86_400_000;
      if (ageDays < 30) bonus += 10; else if (ageDays > 365) bonus -= 8;
    }
    // Minimum floor for Homely-imported leads with any real signal so we never default to ❄️.
    const hasHomelySignal = !!(prefs.source === 'homely' && (notes || raw.priceshekel || raw.agent || raw.room));
    const score = Math.max(0, Math.min(100, base + bonus));
    return hasHomelySignal ? Math.max(score, 35) : score;
  };

  // Real-estate temperature tiers driven by the dynamic score.
  // 0-29 = קר ❄️, 30-59 = פושר 🌤️, 60-79 = חם 🔥, 80-100 = רותח 🌋
  const getPoliticalProfile = (status: string | null, engagement: number | null, lead?: any) => {
    const score = lead ? computeLeadTemp(lead) : Math.max(0, Math.min(100, Number(engagement ?? 0)));
    const sent = getSentimentForVoter(score);

    // Pipeline overrides (closed/negotiation always win over temperature).
    if (status === 'closed' || status === 'supporter' || status === 'voted') {
      return { ...sent, score, badge: 'נסגר', emoji: '🤝', badgeClass: 'bg-emerald-600 text-white border-emerald-700' };
    }
    if (status === 'negotiation') {
      return { ...sent, score, badge: 'במשא ומתן', emoji: '✍️', badgeClass: 'bg-amber-500 text-white border-amber-600' };
    }

    if (score >= 80) return { ...sent, score, badge: 'מתעניין רותח', emoji: '🌋', badgeClass: 'bg-red-600 text-white border-red-700' };
    if (score >= 60) return { ...sent, score, badge: 'מתעניין חם',   emoji: '🔥', badgeClass: 'bg-orange-500 text-white border-orange-600' };
    if (score >= 30) return { ...sent, score, badge: 'מתעניין פושר', emoji: '🌤️', badgeClass: 'bg-amber-400 text-amber-950 border-amber-500' };
    return { ...sent, score, badge: 'מתעניין קר', emoji: '❄️', badgeClass: 'bg-slate-500 text-white border-slate-600' };
  };


  const getSentimentFromMessages = (messages: typeof voterMessages) => {
    if (!messages || messages.length === 0) return { key: 'neutral' as const, emoji: '😐', label: 'ניטרלי', color: 'text-amber-500' };
    const recent = messages.slice(-5);
    const positiveWords = ['תודה', 'מעולה', 'אהבתי', 'תומך', 'בעד'];
    const negativeWords = ['נגד', 'גרוע', 'מאכזב', 'בושה'];
    let score = 0;
    recent.forEach(m => {
      const c = m.content?.toLowerCase() || '';
      positiveWords.forEach(w => { if (c.includes(w)) score++; });
      negativeWords.forEach(w => { if (c.includes(w)) score--; });
    });
    if (score > 0) return { key: 'positive' as const, emoji: '😊', label: 'חיובי', color: 'text-emerald-500' };
    if (score < 0) return { key: 'negative' as const, emoji: '😠', label: 'שלילי', color: 'text-red-500' };
    return { key: 'neutral' as const, emoji: '😐', label: 'ניטרלי', color: 'text-amber-500' };
  };

  // Batch selection
  const allFilteredSelected = filtered && filtered.length > 0 && filtered.every(v => selectedIds.has(v.id));
  const toggleAll = () => {
    if (allFilteredSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered?.map(v => v.id) ?? []));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleExportExcel = (mode: 'selected' | 'filtered') => {
    const source = mode === 'selected'
      ? leads?.filter(v => selectedIds.has(v.id))
      : filtered;
    const rows = source?.map(v => ({
      'שם מלא': v.full_name, 'טלפון': formatPhoneDisplay(v.phone_number), 'עיר': v.city,
      'נושא עניין': v.interest_tag, 'דרגת נאמנות': getLoyalty(v.status).label,
      'שלב מתעניין': getPoliticalProfile(v.status, v.engagement_score).badge,
      'הצביע': v.is_voted ? 'כן' : 'לא', 'ציון מעורבות': v.engagement_score,
    }));
    if (!rows?.length) { toast.error('אין נתונים לייצוא'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'מתעניינים');
    XLSX.writeFile(wb, `מתעניינים_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success(`${rows.length} מתעניינים יוצאו בהצלחה`);
  };

  const handleAiBlastPreview = () => {
    const selected = leads?.filter(v => selectedIds.has(v.id)) ?? [];
    const previews = selected.slice(0, 10).map(v => {
      const interest = v.interest_tag || 'כללי';
      const name = v.full_name || 'מתעניין';
      const score = v.engagement_score ?? 0;
      let tone = 'ידידותי';
      if (score >= 60) tone = 'חם ומחזק';
      else if (score < 30) tone = 'מניע לפעולה';
      return {
        name,
        message: `שלום ${name}! 👋\nראיתי שאתה מתעניין ב${interest}. רציתי לעדכן אותך שיש לנו חדשות חשובות בנושא.\n\nנשמח אם תצטרף אלינו - ביחד נשפיע! 🇮🇱\n\n[סגנון: ${tone}]`,
      };
    });
    setAiPreviews(previews);
    setAiBlastOpen(true);
  };

  const handleBatchStatus = async (newStatus: string) => {
    if (blockDemoAction('bulk-status')) return;
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      const { data: count, error } = await supabase.rpc('bulk_update_leads', {
        lead_ids: ids,
        new_status: newStatus,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] });
      setSelectedIds(new Set());
      toast.success(`${count ?? ids.length} מתעניינים עודכנו ל-${hebrewLabel(statusHebrew, newStatus)}`);
    } catch (err: any) {
      toast.error('שגיאה בעדכון סטטוס: ' + (err?.message || ''));
    }
  };

  const handleBulkInterestTag = async (tag: string) => {
    if (blockDemoAction('bulk-interest-tag')) return;
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      const { data: count, error } = await supabase.rpc('bulk_update_leads', {
        lead_ids: ids,
        new_interest_tag: tag,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] });
      setSelectedIds(new Set());
      toast.success(`${count ?? ids.length} מתעניינים עודכנו לתגית "${tag}"`);
    } catch (err: any) {
      toast.error('שגיאה בעדכון תגית: ' + (err?.message || ''));
    }
  };

  const openBatchDeleteDialog = () => {
    if (blockDemoAction('delete-leads')) return;
    if (!selectedIds.size) return;
    setDeleteConfirmText('');
    setDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (ids.length > 50 && !isAdmin) {
      toast.error('מחיקה של מעל 50 רשומות דורשת הרשאת מנהל');
      return;
    }
    if (deleteConfirmText.trim() !== 'DELETE') {
      toast.error('יש להקליד DELETE באותיות גדולות לאישור');
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc('delete_leads_cascade', { _ids: ids });
      if (error) {
        toast.error('שגיאה במחיקה: ' + error.message);
        return;
      }
      const deleted = typeof data === 'number' ? data : Number(data ?? 0);
      if (deleted === 0) {
        toast.error('המחיקה נחסמה - אין הרשאה למחוק את הרשומות שנבחרו');
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads-infinite'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] }),
        queryClient.invalidateQueries({ queryKey: ['leads-total'] }),
      ]);
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      setDeleteConfirmText('');
      toast.success(`${deleted} מתעניינים נמחקו בהצלחה`);
    } finally {
      setDeleting(false);
    }
  };


  const handleAddToCampaign = async (campaignId: string) => {
    if (blockDemoAction('add-to-campaign')) return;
    const ids = Array.from(selectedIds);
    await sendToN8n('add_to_campaign', { campaign_id: campaignId, lead_ids: ids });
    toast.success(`${ids.length} מתעניינים נוספו לקמפיין`);
    setAddToCampaignOpen(false);
    setSelectedIds(new Set());
  };

  /**
   * "Add Lead" no longer writes a placeholder row. The NewLeadDialog collects
   * name + phone (and pipeline fields) and only then inserts a real lead, so
   * the CRM can never accumulate blank "לקוח חדש" records.
   */

  /** Permanently delete a single lead from the CRM profile sheet. */
  const deleteSingleLead = async (leadId: string) => {
    setDeletingSingle(true);
    try {
      const { data, error } = await supabase.rpc('delete_leads_cascade', { _ids: [leadId] } as any);
      if (error) throw error;
      const deleted = typeof data === 'number' ? data : Number(data ?? 0);
      if (deleted === 0) {
        toast.error('המחיקה נחסמה - אין הרשאה למחוק את הרשומה');
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads-infinite'] }),
        queryClient.invalidateQueries({ queryKey: ['leads-total'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] }),
      ]);
      setSingleDeleteId(null);
      setSelectedVoterId(null);
      if (routeLeadId) navigate('/lead-crm');
      toast.success('המתעניין נמחק לצמיתות');
    } catch (err: any) {
      toast.error('מחיקה נכשלה: ' + (err?.message || 'שגיאה'));
    } finally {
      setDeletingSingle(false);
    }
  };

  const handleAddVoter = async () => {
    if (blockDemoAction('add-lead')) return;
    if (!newVoter.full_name.trim() || !newVoter.phone_number.trim()) {
      toast.error('שם מלא וטלפון הם שדות חובה');
      return;
    }
    const phone = normalizeIsraeliPhone(newVoter.phone_number);
    if (!phone) {
      toast.error('מספר טלפון לא תקין');
      return;
    }
    setAddingVoter(true);
    try {
      const insertData: Record<string, any> = {
        full_name: newVoter.full_name.trim(),
        phone_number: phone,
        city: newVoter.city.trim() || null,
        identity_number: newVoter.identity_number.trim() || null,
        assigned_to: activeWorkspaceId ?? user?.id ?? null,
      };
      if (newVoter.instagram_handle.trim()) insertData.instagram_handle = newVoter.instagram_handle.trim();
      if (newVoter.telegram_username.trim()) insertData.telegram_username = newVoter.telegram_username.trim();
      // Instant write: return the full row immediately so the UI reflects it
      // without waiting for background sync / realtime.
      const { data: inserted, error } = await supabase
        .from('leads')
        .insert(insertData as any)
        .select('*')
        .single();
      if (error) throw error;
      // Prime the infinite list cache so the new lead appears instantly.
      try {
        queryClient.setQueriesData({ queryKey: ['leads-infinite'] }, (old: any) => {
          if (!old?.pages?.length) return old;
          const pages = [...old.pages];
          pages[0] = { ...pages[0], data: [inserted, ...(pages[0]?.data ?? [])] };
          return { ...old, pages };
        });
      } catch { /* non-fatal cache prime */ }
      queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] });
      queryClient.invalidateQueries({ queryKey: ['leads-total'] });
      toast.success('מתעניין נוסף בהצלחה');
      // Fire-and-forget Green API avatar fetch so the new row gets a real WA photo.
      supabase.functions
        .invoke('fetch-wa-avatars', { body: { lead_ids: [(inserted as any).id], owner_id: activeWorkspaceId, force: true } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['leads-infinite'] }))
        .catch(() => {});
      setAddVoterOpen(false);
      setNewVoter({ full_name: '', phone_number: '', city: '', identity_number: '', instagram_handle: '', telegram_username: '' });

    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('TRIAL_RECORD_LIMIT')) {
        toast.error('מסלול הניסיון מוגבל ל-100 רשומות. שדרג עכשיו כדי לנהל את כל מאגר המתעניינים שלך', {
          duration: 8000,
          action: { label: 'שדרג עכשיו', onClick: () => window.location.assign('/upgrade') },
        });
      } else {
        toast.error('שגיאה בהוספת מתעניין: ' + (err?.message || 'שגיאה'));
      }
    } finally {
      setAddingVoter(false);
    }
  };

  const getRadarData = (lead: any) => {
    const defaults = { security: 0, economy: 0, judicial: 0, social: 0, governance: 0 };
    const scores = (lead as any).interest_score_json || defaults;
    return Object.entries({ ...defaults, ...scores }).map(([key, value]) => ({
      subject: radarAxisLabels[key] || key,
      value: typeof value === 'number' ? value : 0,
      fullMark: 100,
    }));
  };

  // Import logic - bilingual header mapping (Hebrew + English), CSV + XLSX + JSON support
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isCsv = /\.csv$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isJson = /\.json$/i.test(file.name) || file.type === 'application/json';
    setImportIsJson(isJson);

    const processRows = (rows: Record<string, any>[]) => {
      try {
        if (rows.length === 0) { toast.error('הקובץ ריק'); return; }


        // Build canonical->actualHeader map from the union of row keys (JSON rows can vary)
        const headers = Array.from(new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r ?? {}))));
        const headerMap = buildHeaderMap(headers);

        const get = (row: Record<string, any>, field: string): string => {
          const key = headerMap[field];
          return key ? String(row[key] ?? '').trim() : '';
        };

        // Detected fields summary (in Hebrew)
        const fieldLabels: Record<string, string> = {
          first_name: 'שם פרטי', last_name: 'שם משפחה', full_name: 'שם',
          phone: 'טלפון', email: 'אימייל', city: 'עיר',
          identity_number: 'ת.ז', interest_tag: 'נושא',
        };
        const detectedFields = Object.keys(headerMap).map((k) => fieldLabels[k] ?? k);
        const hasPhoneColumn = !!headerMap.phone;

        if (!hasPhoneColumn) {
          toast.error('עמודת טלפון חסרה - לא ניתן לייבא ללא מספר טלפון', { duration: 6000 });
          setImportStats({ total: rows.length, valid: 0, duplicates: 0, invalid: rows.length, healthPct: 0, detectedFields, missingPhone: true });
          setImportPreview([]);
          setImportDialogOpen(true);
          (window as any).__importRows = [];
          return;
        }

        const existingPhones = new Set(leads?.map((v) => v.phone_number) ?? []);
        const seenPhones = new Set<string>();
        const validRows: ImportRow[] = [];
        let duplicates = 0;
        let invalid = 0;

        for (const row of rows) {
          const firstName = get(row, 'first_name');
          const lastName = get(row, 'last_name');
          const fullNameDirect = get(row, 'full_name');
          const name = fullNameDirect || [firstName, lastName].filter(Boolean).join(' ').trim();

          const rawPhone = get(row, 'phone');
          const city = get(row, 'city') || undefined;
          const identityNumber = get(row, 'identity_number') || undefined;
          const interest = get(row, 'interest_tag') || undefined;
          const email = get(row, 'email') || undefined;

          if (!name) { invalid++; continue; }
          const phone = normalizeIsraeliPhone(rawPhone);
          if (!phone) { invalid++; continue; }
          // JSON imports intentionally allow existing contacts through so their
          // phone numbers get updated (upsert) instead of being skipped.
          if (seenPhones.has(phone) || (!isJson && existingPhones.has(phone))) { duplicates++; continue; }
          seenPhones.add(phone);

          // Capture EVERY original column from the source file (mapped + unmapped),
          // skipping empties. Keys are the original headers so the agent recognises them.
          const extra: Record<string, string> = {};
          for (const [origKey, value] of Object.entries(row)) {
            if (value == null) continue;
            const str = String(value).trim();
            if (!str) continue;
            // Skip the phone column — it's already normalized into phone_number
            if (headerMap.phone === origKey) continue;
            extra[origKey] = str;
          }

          validRows.push({
            full_name: name,
            phone_number: phone,
            city,
            interest_tag: interest,
            identity_number: identityNumber,
            email,
            extra: Object.keys(extra).length ? extra : undefined,
          });
        }

        const healthPct = rows.length > 0 ? Math.round((validRows.length / rows.length) * 100) : 0;
        setImportPreview(validRows.slice(0, 50));
        setImportStats({ total: rows.length, valid: validRows.length, duplicates, invalid, healthPct, detectedFields, missingPhone: false });
        setImportDialogOpen(true);
        (window as any).__importRows = validRows;
      } catch (err: any) {
        console.error('Import parse error:', err);
        toast.error('שגיאה בקריאת הקובץ: ' + (err?.message || 'פורמט לא נתמך'));
      }
    };

    if (isPdf) {
      parsePdfToRows(file)
        .then((res) => {
          if (!res.rows.length) { toast.error('לא נמצאו שורות נתונים ב-PDF'); return; }
          processRows(res.rows);
        })
        .catch((err) => {
          console.error('PDF parse error:', err);
          toast.error('שגיאה בקריאת PDF: ' + (err?.message || ''));
        })
        .finally(() => { e.target.value = ''; });
      return;
    }

    if (isJson) {
      const jsonReader = new FileReader();
      jsonReader.onload = (evt) => {
        try {
          const parsed = JSON.parse(String(evt.target?.result ?? ''));
          const pickArray = (val: any): any[] => {
            if (Array.isArray(val)) return val;
            if (val && typeof val === 'object') {
              const preferredKeys = ['contacts', 'leads', 'records', 'data', 'rows', 'items', 'results'];
              for (const k of preferredKeys) if (Array.isArray(val[k])) return val[k];
              for (const v of Object.values(val)) if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) return v as any[];
              return [val];
            }
            return [];
          };
          // Flatten one level of nested objects so keys like contact.phone are mappable
          const flatten = (obj: any, prefix = ''): Record<string, any> => {
            const out: Record<string, any> = {};
            for (const [k, v] of Object.entries(obj ?? {})) {
              const key = prefix ? `${prefix}.${k}` : k;
              if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
              else if (Array.isArray(v)) out[key] = v.filter((x) => typeof x !== 'object').join(', ');
              else out[key] = v;
            }
            return out;
          };
          const rows = pickArray(parsed)
            .filter((r) => r && typeof r === 'object')
            .map((r) => flatten(r));
          if (!rows.length) { toast.error('לא נמצאו רשומות בקובץ ה-JSON'); return; }
          processRows(rows);
        } catch (err: any) {
          console.error('JSON parse error:', err);
          toast.error('שגיאה בקריאת JSON: ' + (err?.message || 'מבנה לא תקין'));
        }
      };
      jsonReader.readAsText(file, 'UTF-8');
      e.target.value = '';
      return;
    }


    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        let workbook: XLSX.WorkBook;
        if (isCsv) {
          let text = evt.target?.result as string;
          if (text && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
          workbook = XLSX.read(text, { type: 'string', raw: false });
        } else {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          workbook = XLSX.read(data, { type: 'array' });
        }
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
        processRows(rows);
      } catch (err: any) {
        console.error('Import parse error:', err);
        toast.error('שגיאה בקריאת הקובץ: ' + (err?.message || 'פורמט לא נתמך'));
      }
    };
    if (isCsv) reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (blockDemoAction('import-leads')) return;
    const rows: ImportRow[] = (window as any).__importRows;
    if (!rows || rows.length === 0) {
      toast.error('אין שורות תקינות לייבוא');
      return;
    }
    setImporting(true);
    setImportProgress(0);
    let totalInserted = 0;
    try {
      const batchSize = 500;
      const totalRows = rows.length;
      for (let i = 0; i < rows.length; i += batchSize) {
        const dealType = importLeadKind === 'renter' || importLeadKind === 'landlord' ? 'rent' : 'sale';
        const batch = rows.slice(i, i + batchSize).map((r) => ({
          full_name: r.full_name,
          phone_number: r.phone_number,
          email: r.email || null,
          city: r.city || null,
          interest_tag: r.interest_tag || null,
          identity_number: r.identity_number || null,
          status: 'uploaded',
          deal_type: dealType,
          // Persist the agent-chosen kind AND every original column from the file
          // under preferences.extra_fields so nothing the user uploaded is lost.
          preferences: {
            lead_kind: importLeadKind,
            ...(r.extra && Object.keys(r.extra).length ? { extra_fields: r.extra } : {}),
          },
        }));
        const { data, error } = await supabase
          .from('leads')
          .upsert(batch, { onConflict: 'phone_number' })
          .select('id');
        if (error) throw error;
        totalInserted += data?.length ?? 0;
        setImportProgress(Math.round(((i + batch.length) / totalRows) * 100));
      }
      // Only after Supabase confirmed: refresh and toast success
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads-infinite'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-filter-options'] }),
        queryClient.invalidateQueries({ queryKey: ['leads-total'] }),
      ]);

      toast.success(`ייבוא הושלם: ${totalInserted.toLocaleString('he-IL')} רשומות נשמרו במאגר`);

      // Background Green API avatar fetch for the freshly imported rows.
      supabase.functions.invoke('fetch-wa-avatars', { body: { limit: Math.min(totalInserted + 50, 2000), owner_id: activeWorkspaceId } }).catch(() => {});

      const n8nResult = await sendToN8n('contacts_synced', { imported_count: totalInserted, phone_numbers: rows.map((r) => r.phone_number) });
      if (n8nResult.ok) toast.success('רשימות התפוצה עודכנו');
      else if (!n8nResult.skipped) toast.warning('הייבוא הצליח אך סנכרון n8n נכשל');

      setImportDialogOpen(false);
      setImportPreview([]);
      setImportStats(null);
      delete (window as any).__importRows;
    } catch (err: any) {
      toast.error('שגיאה בייבוא: ' + (err?.message || 'שגיאה לא ידועה'));
    } finally { setImporting(false); }
  };

  const messageSentiment = getSentimentFromMessages(activeVoterMessages);

  return (
    <div className="space-y-4 relative pb-20 pt-5">
      {/* Header + add menu live in the global PageHero (top bar) */}


      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
      {freemium.isTrial && (
        <div className="hidden sm:flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground w-fit ms-auto">
          <span>נותרו <span className="font-semibold text-foreground tabular-nums">{freemium.daysLeft}</span> ימי התנסות</span>
          <span className="text-border">·</span>
          <span><span className="font-semibold text-foreground tabular-nums">{freemium.contactsUsed}</span> / {freemium.contactsCap} אנשי קשר</span>
          <span className="text-border">·</span>
          <span>יתרה <PriceTag value={freemium.walletILS} fractionDigits={2} /></span>
        </div>
      )}

      {/* Data Table */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="חיפוש חופשי..." className="pr-9 pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="סינון וייצוא"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Lead kind tabs */}
            <div className="flex flex-wrap gap-1.5 -mt-1">
              {([
                { v: 'all', label: 'הכל' },
                { v: 'buyer', label: 'קונים' },
                { v: 'seller', label: 'מוכרים' },
                { v: 'renter', label: 'שוכרים' },
                { v: 'landlord', label: 'משכירים' },
              ] as const).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setLeadKindFilter(t.v as typeof leadKindFilter)}
                  className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                    leadKindFilter === t.v
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-primary hover:text-primary-foreground hover:border-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {(() => {
              const hasFilter = !!search.trim() || interestFilter !== 'all' || cityFilter !== 'all' || statusFilter !== 'all' || profileFilter !== 'all' || leadKindFilter !== 'all';
              const accountTotal = isDemoMode ? leads.length : realTotalCount;
              const filteredTotal = isDemoMode ? filtered?.length ?? 0 : totalCount;
              return (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {selectedIds.size > 0
                    ? `נבחרו ${selectedIds.size.toLocaleString('he-IL')} רשומות`
                    : accountTotal === 0
                      ? 'אין רשומות במאגר. העלה רשימה כדי להתחיל'
                      : hasFilter
                        ? `מציג ${filteredTotal.toLocaleString('he-IL')} מתוך ${accountTotal.toLocaleString('he-IL')}`
                        : `סה״כ: ${accountTotal.toLocaleString('he-IL')} רשומות`}
                </p>
              );
            })()}
          </div>
          {filtersOpen && <div className="flex flex-wrap gap-2 pt-2 animate-fade-in">
            <Select value={interestFilter} onValueChange={setInterestFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><Tag className="h-3 w-3 ml-1" /><SelectValue placeholder="סנן לפי נושא" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הנושאים</SelectItem>
                {uniqueInterests.map((t) => <SelectItem key={t} value={t!}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><MapPin className="h-3 w-3 ml-1" /><SelectValue placeholder="סנן לפי עיר" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הערים</SelectItem>
                {uniqueCities.map((c) => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="סנן לפי סטטוס" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                {uniqueStatuses.map((s) => <SelectItem key={s} value={s!}>{hebrewLabel(statusHebrew, s) || s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={profileFilter} onValueChange={setProfileFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="שלב" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל השלבים</SelectItem>
                <SelectItem value="מתעניין קר">מתעניין קר</SelectItem>
                <SelectItem value="מתעניין מוסמך">מתעניין מוסמך</SelectItem>
                <SelectItem value="במשא ומתן">במשא ומתן</SelectItem>
                <SelectItem value="נסגר">נסגר</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dealTypeFilter} onValueChange={setDealTypeFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><Home className="h-3 w-3 ml-1" /><SelectValue placeholder="סוג עסקה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל סוגי העסקה</SelectItem>
                <SelectItem value="sale">קנייה / מכירה</SelectItem>
                <SelectItem value="rent">שכירות / השכרה</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="יחס הלקוח" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל רמות היחס</SelectItem>
                {(filterOptions?.sentiments ?? ['positive', 'neutral', 'negative']).map((s) => (
                  <SelectItem key={s} value={s!}>{SENTIMENT_LABEL_HE[s!] || 'ניטרלי'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="ערוץ הגעה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל ערוצי ההגעה</SelectItem>
                {(filterOptions?.channels ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>}
        </CardHeader>
        {selectedIds.size > 0 && (
          <div className="border-t border-border/60 bg-muted/30 px-4 py-2 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <Badge variant="secondary" className="gap-1 text-sm">
              <Users className="h-3.5 w-3.5" /> {selectedIds.size} נבחרו
            </Badge>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setAddToCampaignOpen(true)}>
              <Megaphone className="h-3.5 w-3.5" /> הוסף לקמפיין
            </Button>
            <Select onValueChange={handleBatchStatus}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="שנה סטטוס" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusHebrew).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={handleBulkInterestTag}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="שנה תגית" />
              </SelectTrigger>
              <SelectContent>
                {uniqueInterests.map(t => (
                  <SelectItem key={t} value={t!}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleAiBlastPreview}>
              <Sparkles className="h-3.5 w-3.5" /> שלח הודעת AI
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => handleExportExcel('selected')}>
              <Download className="h-3.5 w-3.5" /> ייצוא נבחרים
            </Button>
            <Button variant="destructive" size="sm" className="gap-1.5 h-8" onClick={openBatchDeleteDialog}>
              <Trash2 className="h-3.5 w-3.5" /> מחק
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 ms-auto" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <CardContent className="p-0">
          <div
            ref={tableContainerRef}
            className="max-h-[65vh] overflow-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
          >
            <Table className="w-full [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th]:!px-[5px] [&_td]:!px-[5px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/30">
                  <TableHead className="w-auto font-semibold text-xs">שם</TableHead>
                  <TableHead className="w-auto font-semibold text-xs text-right">טלפון</TableHead>
                  <TableHead className="w-auto font-semibold text-xs">עיר</TableHead>
                  <TableHead className="w-auto text-center font-semibold text-xs">סוג</TableHead>
                  <TableHead className="w-auto text-center font-semibold text-xs">שלב</TableHead>
                  {extraColumns.map((col) => (
                    <TableHead key={`h-${col}`} className="w-auto font-semibold text-xs text-center">{col}</TableHead>
                  ))}
                  {isOwnerView && HOMELY_OWNER_COLUMNS.map((col) => (
                    <TableHead key={`oh-${col.key}`} className="w-auto font-semibold text-xs text-center bg-blue-50/60">{col.label}</TableHead>
                  ))}
                  <TableHead className="w-10 text-center">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={totalColCount} className="py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="realtyz-loader h-10 w-10" />
                        <p className="text-sm text-muted-foreground">טוען מתעניינים...</p>
                      </div>
                    </TableCell></TableRow>
                  )}
                  {filtered?.length === 0 && !isLoading && (() => {
                    const hasFilter = !!search || interestFilter !== 'all' || cityFilter !== 'all' || statusFilter !== 'all' || profileFilter !== 'all';
                    const accountIsEmpty = !isDemoMode && realTotalCount === 0;
                    return (
                      <TableRow><TableCell colSpan={totalColCount} className="py-0">
                        <div className="empty-state animate-fade-in">
                          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                            {accountIsEmpty ? <Upload className="h-7 w-7 text-muted-foreground/30" /> : <Search className="h-7 w-7 text-muted-foreground/30" />}
                          </div>
                          {accountIsEmpty ? (
                            <>
                              <p className="text-base font-semibold text-foreground mb-1">אין רשומות במאגר</p>
                              <p className="text-sm text-muted-foreground mb-3">העלה רשימה כדי להתחיל</p>
                              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
                                <Upload className="h-4 w-4" /> ייבוא מתעניינים
                              </Button>
                            </>
                          ) : (
                            <>
                              <p className="text-base font-semibold text-foreground mb-1">לא נמצאו מתעניינים</p>
                              <p className="text-sm text-muted-foreground mb-3">נסה לשנות את הפילטרים או את מילות החיפוש</p>
                              {hasFilter && (
                                <Button variant="outline" size="sm" onClick={() => { setInterestFilter('all'); setCityFilter('all'); setStatusFilter('all'); setProfileFilter('all'); setSearch(''); }}>
                                  נקה פילטרים
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell></TableRow>
                    );
                  })()}
                  {filtered?.map((lead) => {
                    const profile = getPoliticalProfile(lead.status, lead.engagement_score, lead);
                    const eng = profile.score;
                    const rowCls = compactMode
                      ? 'cursor-pointer hover:bg-accent/40 transition-colors text-sm leading-snug [&>td]:!px-0 [&>td]:py-1.5'
                      : 'cursor-pointer hover:bg-accent/40 transition-colors text-base [&>td]:!px-0 [&>td]:py-2';
                    const prefs = (lead as any).preferences ?? {};
                    const sourceLabel = prefs.homely_id || prefs.source === 'homely' ? 'הומלי' : 'Realtyz CRM';
                    const sourceCls = prefs.homely_id || prefs.source === 'homely'
                      ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                      : 'bg-primary/10 text-primary border-primary/30';
                    const cleanPhone = String(lead.phone_number ?? '').replace(/\D/g, '');
                    const waHref = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone}` : null;
                    const homelyId = prefs.homely_id ? String(prefs.homely_id) : null;
                    return (
                      <TableRow key={lead.id} className={rowCls}>
                        <TableCell className="font-medium whitespace-nowrap" onClick={() => setSelectedVoterId(lead.id)}>
                          <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                            <VoterAvatar fullName={lead.full_name} profilePictureUrl={(lead as any).profile_picture_url} className="h-9 w-9" textClassName="text-xs" />
                            <div className="flex flex-col min-w-0">
                              <span className="min-w-0 truncate whitespace-nowrap text-sm font-semibold">{lead.full_name || '-'}</span>
                              <div className="flex items-center gap-1.5">
                                {(prefs.homely_id || prefs.source === 'homely') && (
                                  <Badge variant="outline" className={`text-[10px] font-normal h-4 px-1.5 ${sourceCls}`}>{sourceLabel}</Badge>
                                )}
                                {homelyId && (
                                  <a
                                    href={`/properties?homely=${encodeURIComponent(homelyId)}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] text-muted-foreground hover:text-primary hover:underline font-mono"
                                    title="פתח את הרשומה המקורית בהומלי"
                                  >
                                    #{homelyId}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-right" dir="ltr" onClick={(e) => { if (waHref) e.stopPropagation(); }}>
                          {!isValidIsraeliPhone(lead.phone_number) ? (
                            <span className="text-muted-foreground">—</span>
                          ) : waHref ? (
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                              title="פתח שיחת WhatsApp"
                            >
                              {formatPhoneDisplay(lead.phone_number)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{formatPhoneDisplay(lead.phone_number)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm" onClick={() => setSelectedVoterId(lead.id)}>{lead.city || '-'}</TableCell>
                        <TableCell className="text-center" onClick={() => setSelectedVoterId(lead.id)}>
                          {(() => {
                            const kind = prefs.lead_kind as string | undefined;
                            const map: Record<string, { label: string; cls: string }> = {
                              buyer:    { label: 'קונה',   cls: 'bg-blue-500/10 text-blue-700 border-blue-300' },
                              seller:   { label: 'מוכר',   cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-300' },
                              renter:   { label: 'שוכר',   cls: 'bg-[#0b3982]/10 text-[#0b3982] border-[#0b3982]/40' },
                              landlord: { label: 'משכיר', cls: 'bg-purple-500/10 text-purple-700 border-purple-300' },
                            };
                            const m = kind ? map[kind] : null;
                            return m
                              ? <Badge variant="outline" className={`text-xs font-normal ${m.cls}`}>{m.label}</Badge>
                              : <span className="text-xs text-muted-foreground">-</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-center !px-0" onClick={() => setSelectedVoterId(lead.id)}>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center justify-center w-full">
                                  <span className="text-2xl leading-none" aria-hidden>{profile.emoji}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-right">
                                {profile.badge} · ציון לידים {eng}/100 · סנטימנט {profile.label}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>

                        {extraColumns.map((col) => {
                          const ex = (lead as any).preferences?.extra_fields ?? {};
                          const val = ex?.[col];
                          return (
                            <TableCell
                              key={`c-${lead.id}-${col}`}
                              className="text-[11px] text-center text-muted-foreground"
                              onClick={() => setSelectedVoterId(lead.id)}
                              title={val ? String(val) : ''}
                            >
                              <span className="inline-block max-w-[160px] truncate align-middle">{val != null && val !== '' ? String(val) : '-'}</span>
                            </TableCell>
                          );
                        })}
                        {isOwnerView && (() => {
                          const linked = (lead as any).linked_listing_id ? listingsById[(lead as any).linked_listing_id] : null;
                          const hydrated = { ...(lead as any), __listing: linked };
                          return HOMELY_OWNER_COLUMNS.map((col) => {
                            const val = col.render(hydrated);
                            return (
                              <TableCell key={`oc-${lead.id}-${col.key}`}
                                className="text-[11px] text-center text-slate-700 bg-blue-50/30"
                                onClick={() => setSelectedVoterId(lead.id)}
                                title={String(val)}>
                                <span className="inline-block max-w-[140px] truncate align-middle">{val}</span>
                              </TableCell>
                            );
                          });
                        })()}
                        <TableCell className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleOne(lead.id)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {isFetchingNextPage && (
                    <TableRow><TableCell colSpan={totalColCount} className="text-center text-muted-foreground py-4">טוען עוד...</TableCell></TableRow>
                  )}
              </TableBody>
            </Table>
          </div>
          {hasNextPage && (
            <div className="px-4 py-2 border-t flex justify-center">
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                טען עוד
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Communication Status Info Dialog */}
      <Dialog open={statusInfoOpen} onOpenChange={setStatusInfoOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          {(() => {
            const v = leads?.find((x) => x.id === selectedVoterId);
            const status = v?.status || 'cold';
            const cfg = getLoyalty(status);
            const descriptions: Record<string, string> = {
              cold: 'מתעניין קר — נרשם במערכת אך עדיין לא הייתה אינטראקציה משמעותית. הסוכן הדיגיטלי ינסה ליצור קשר ראשוני.',
              qualified: 'מתעניין מוסמך — נוצר קשר, אומתו צרכים בסיסיים (תקציב/אזור/סוג נכס). מוכן לשלב הצגת נכסים.',
              negotiation: 'במשא ומתן — התקיים סיור או הוצגה הצעה. שלב רגיש: הסוכן מעדיף תשובה אישית של הברוקר.',
              closed: 'נסגר — העסקה הושלמה. הלקוח עובר למאגר חיזוק קשר ולא ייפנה אוטומטית.',
              contacted: 'נוצר קשר — בוצעה פנייה ראשונית. ממתינים לתגובה כדי להעלות לשלב הבא.',
              inactive: 'לא רלוונטי — לא מתאים כרגע. לא תישלחנה פניות עד שינוי ידני של הסטטוס.',
              lead: 'מתעניין קר — נרשם במערכת אך עדיין לא הייתה אינטראקציה משמעותית.',
              supporter: 'נסגר — העסקה הושלמה.',
              active: 'מתעניין מוסמך — קשר פעיל ושוטף.',
              voted: 'נסגר — העסקה הושלמה.',
            };
            const lastInteraction = v?.last_interaction_at
              ? format(new Date(v.last_interaction_at), 'dd/MM/yyyy HH:mm')
              : 'לא נרשמה אינטראקציה';
            const createdAt = (v as any)?.created_at
              ? format(new Date((v as any).created_at), 'dd/MM/yyyy HH:mm')
              : '—';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className={`border text-xs rounded-md px-2.5 py-1 font-medium ${cfg.color}`}>{cfg.label}</span>
                    <span>סטטוס תקשורת</span>
                  </DialogTitle>
                  <DialogDescription className="text-right">{descriptions[status] || 'אין תיאור זמין לסטטוס זה.'}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border/40 py-2">
                    <span className="text-muted-foreground">נוצר במערכת</span>
                    <span className="font-medium">{createdAt}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 py-2">
                    <span className="text-muted-foreground">אינטראקציה אחרונה</span>
                    <span className="font-medium">{lastInteraction}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 py-2">
                    <span className="text-muted-foreground">סוכן דיגיטלי</span>
                    <span className="font-medium">{v?.ai_autopilot ? 'פעיל' : 'כבוי'}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">ציון מעורבות</span>
                    <span className="font-medium">{v?.engagement_score ?? 0}</span>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStatusInfoOpen(false)}>סגור</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add to Campaign Dialog */}
      <Dialog open={addToCampaignOpen} onOpenChange={setAddToCampaignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף לקמפיין</DialogTitle>
            <DialogDescription>בחר קמפיין להוספת {selectedIds.size} מתעניינים</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {campaigns?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">אין קמפיינים פעילים</p>}
            {campaigns?.map((c) => (
              <Button key={c.id} variant="outline" className="w-full justify-start gap-2" onClick={() => handleAddToCampaign(c.id)}>
                <Megaphone className="h-4 w-4 text-primary" />
                {c.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Blast Preview Modal */}
      <Dialog open={aiBlastOpen} onOpenChange={setAiBlastOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              תצוגה מקדימה - הודעת AI מותאמת אישית
            </DialogTitle>
            <DialogDescription>
              {selectedIds.size} מתעניינים נבחרו · מוצגות עד 10 דוגמאות
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {aiPreviews.map((p, i) => (
              <div key={i} className="rounded-xl border border-border/50 p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">{p.name}</span>
                </div>
                <div className="bg-background rounded-lg px-4 py-3 text-sm leading-relaxed border border-border/30 whitespace-pre-wrap">
                  {p.message}
                </div>
              </div>
            ))}
            {aiPreviews.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">בחר מתעניינים כדי לצפות בתצוגה מקדימה</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAiBlastOpen(false)}>סגור</Button>
            <Button disabled className="gap-2 opacity-60">
              <Eye className="h-4 w-4" /> שליחה בקרוב...
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Lead Profile Sheet */}
      <Sheet open={!!selectedVoterId} onOpenChange={(open) => {
        if (!open) {
          setSelectedVoterId(null);
          if (routeLeadId) {
            // Came in via /lead-crm/:id deep-link — return to the previous screen (inbox, dashboard, etc.)
            if (window.history.length > 1) navigate(-1);
            else navigate('/lead-crm');
          }
        }
      }}>

        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" side="right">
          {selectedVoter && (() => {
            // Health Score: based on user replies in chat_history
            const userReplies = activeVoterChatHistory?.filter(m => m.role === 'user').length ?? 0;
            const totalMessages = activeVoterChatHistory?.length ?? 0;
            const healthScore = totalMessages > 0 ? Math.min(100, Math.round((userReplies / Math.max(totalMessages, 1)) * 100 * 1.5)) : 0;
            const healthColor = healthScore >= 60 ? 'text-emerald-500' : healthScore >= 30 ? 'text-amber-500' : 'text-destructive';

            // Build unified timeline events
            type TimelineEvent = { id: string; date: string; type: 'created' | 'message_in' | 'message_out' | 'chat_user' | 'chat_ai' | 'status'; label: string; detail: string; };
            const events: TimelineEvent[] = [];

            // Creation event
            if (selectedVoter.created_at) {
              events.push({ id: 'created', date: selectedVoter.created_at, type: 'created', label: 'נוסף למערכת', detail: selectedVoter.full_name || 'מתעניין חדש' });
            }

            // Messages from messages table
            activeVoterMessages?.forEach(msg => {
              const channelLabel = ((): string => {
                const p = String((msg as any).platform || (msg as any).channel || '').toLowerCase();
                if (p.includes('whatsapp')) return 'וואטסאפ';
                if (p.includes('instagram')) return 'אינסטגרם';
                if (p.includes('facebook') || p.includes('messenger')) return 'פייסבוק';
                if (p.includes('email')) return 'אימייל';
                if (p.includes('sms')) return 'SMS';
                return '';
              })();
              const isOut = msg.direction === 'outbound';
              const who = isOut
                ? ((msg as any).sender_type === 'ai' ? 'הסוכן הדיגיטלי שלח' : 'נשלחה הודעה')
                : 'הודעה מהלקוח';
              events.push({
                id: `msg-${msg.id}`,
                date: msg.created_at || '',
                type: isOut ? 'message_out' : 'message_in',
                label: channelLabel ? `${who} · ${channelLabel}` : who,
                detail: msg.content?.slice(0, 80) || 'אין תוכן',
              });
            });

            // Chat history
            activeVoterChatHistory?.forEach(ch => {
              events.push({
                id: `chat-${ch.id}`,
                date: ch.created_at || '',
                type: ch.role === 'assistant' ? 'chat_ai' : 'chat_user',
                label: ch.role === 'assistant' ? 'תיאום סיור / עדכון מהסוכן הדיגיטלי' : 'הערות לקוח עודכנו במערכת',
                detail: ch.content?.slice(0, 80) || '',
              });
            });

            // Dedupe: drop events whose normalized content+direction matches another
            // event within a 30s window (covers messages mirrored into chat_history).
            const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase();
            const sideOf = (t: TimelineEvent['type']) =>
              t === 'message_out' || t === 'chat_ai' ? 'out' :
              t === 'message_in' || t === 'chat_user' ? 'in' : 'other';
            const seen: { key: string; ts: number; preferMsg: boolean }[] = [];
            const deduped: TimelineEvent[] = [];
            for (const e of events) {
              const ts = e.date ? new Date(e.date).getTime() : 0;
              const key = `${sideOf(e.type)}::${norm(e.detail)}`;
              const isMsg = e.type === 'message_in' || e.type === 'message_out';
              const dup = seen.find(s => s.key === key && Math.abs(s.ts - ts) < 30000);
              if (dup) {
                // prefer the messages-table row over the chat_history mirror
                if (isMsg && !dup.preferMsg) {
                  const idx = deduped.findIndex(x => `${sideOf(x.type)}::${norm(x.detail)}` === key);
                  if (idx >= 0) deduped[idx] = e;
                  dup.preferMsg = true;
                }
                continue;
              }
              seen.push({ key, ts, preferMsg: isMsg });
              deduped.push(e);
            }
            events.length = 0;
            events.push(...deduped);
            events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const getEventIcon = (type: TimelineEvent['type']) => {
              switch (type) {
                case 'created': return <UserPlus className="h-3.5 w-3.5" />;
                case 'message_out': return <ArrowUpRight className="h-3.5 w-3.5" />;
                case 'message_in': return <ArrowDownLeft className="h-3.5 w-3.5" />;
                case 'chat_ai': return <Bot className="h-3.5 w-3.5" />;
                case 'chat_user': return <MessageCircle className="h-3.5 w-3.5" />;
                case 'status': return <Tag className="h-3.5 w-3.5" />;
                default: return <Clock className="h-3.5 w-3.5" />;
              }
            };
            const getEventColor = (type: TimelineEvent['type']) => {
              switch (type) {
                case 'created': return 'bg-primary/15 text-primary';
                case 'message_out': return 'bg-primary/10 text-primary';
                case 'message_in': return 'bg-accent text-accent-foreground';
                case 'chat_ai': return 'bg-primary/10 text-primary';
                case 'chat_user': return 'bg-accent text-accent-foreground';
                case 'status': return 'bg-muted text-muted-foreground';
                default: return 'bg-muted text-muted-foreground';
              }
            };

            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-3">
                    {(() => {
                      // Merge column-level social identifiers with the enrichment
                      // profile so the pic-fetch menu offers every channel we know
                      // about — including handles added via the enrichment dialog
                      // (which writes into preferences.socials + prefs.facebook_url
                      // /linkedin_url/x_handle/tiktok_handle/youtube_url).
                      const prefs = ((selectedVoter as any).preferences ?? {}) as any;
                      const socialArr: any[] = Array.isArray(prefs.socials) ? prefs.socials : [];
                      const fromArr = (platform: string) =>
                        socialArr.find((s) => (s?.platform || '').toLowerCase() === platform)?.handle || null;
                      return (
                        <LeadProfilePictureMenu
                          leadId={selectedVoter.id}
                          fullName={selectedVoter.full_name}
                          profilePictureUrl={(selectedVoter as any).profile_picture_url}
                          phone={selectedVoter.phone_number}
                          handles={{
                            instagram: (selectedVoter as any).instagram_handle || fromArr('instagram'),
                            facebook:  (selectedVoter as any).facebook_handle  || prefs.facebook_url || fromArr('facebook'),
                            messenger: (selectedVoter as any).messenger_id,
                            x:         (selectedVoter as any).x_username || (selectedVoter as any).twitter_username || prefs.x_handle || fromArr('x'),
                            tiktok:    (selectedVoter as any).tiktok_handle || (selectedVoter as any).tiktok_username || prefs.tiktok_handle || fromArr('tiktok'),
                            youtube:   (selectedVoter as any).youtube_handle || prefs.youtube_url || fromArr('youtube'),
                            linkedin:  prefs.linkedin_url || fromArr('linkedin'),
                          }}
                          onUpdated={() => queryClient.invalidateQueries({ queryKey: ['leads-infinite'] })}
                        />
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <EditableInlineText
                        value={selectedVoter.full_name || ''}
                        placeholder="מתעניין לא ידוע"
                        ariaLabel="ערוך שם מלא"
                        className="text-lg font-bold max-w-full"
                        onSave={async (next) => {
                          const { error } = await supabase.from('leads').update({ full_name: next || null }).eq('id', selectedVoter.id);
                          if (error) throw error;
                          await queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
                          toast.success('השם עודכן');
                        }}
                      />
                      {(() => {
                        const phoneDigits = (selectedVoter.phone_number || '').replace(/\D/g, '');
                        const email = (selectedVoter as any).email as string | undefined;
                        const inboundChannels = new Set(
                          (activeVoterMessages ?? [])
                            .filter((m: any) => m?.direction === 'inbound' && m?.channel)
                            .map((m: any) => String(m.channel))
                        );
                        const hasChannelIdentifier = (key: string) => {
                          if (key === 'whatsapp' || key === 'sms') return !!phoneDigits;
                          if (key === 'email') return !!email;
                          return !!socialHandleFromLead(selectedVoter, key);
                        };
                        const isChatAvailable = (key: string) =>
                          // WhatsApp is always live for any lead holding a phone number:
                          // the official Meta Cloud API lets us initiate the conversation.
                          inboundChannels.has(key) || ((key === 'whatsapp' || key === 'sms' || key === 'email') && hasChannelIdentifier(key));

                        const channels = CRM_MESSAGE_CHANNELS
                          .filter((c) => isChatAvailable(c.key) || hasChannelIdentifier(c.key))
                          .map((c) => ({
                            ...c,
                            active: isChatAvailable(c.key),
                            onClick: () => navigate(`/inbox?lead=${encodeURIComponent(selectedVoter.id)}&channel=${encodeURIComponent(c.key)}`),
                            icon: c.brand
                              ? <BrandIcon name={c.brand} className="h-4 w-4" />
                              : c.key === 'sms'
                                ? <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
                                : <Mail className="h-4 w-4" strokeWidth={1.8} />,
                          }));
                        return (
                          <div className="flex flex-wrap items-center gap-1 mt-2">
                            {/* Phone sits inline with the action buttons, middle-aligned */}
                            <span className="shrink-0 pe-1 leading-none">
                        <EditableInlineText
                          value={formatPhoneDisplay(selectedVoter.phone_number) === '-' ? '' : formatPhoneDisplay(selectedVoter.phone_number)}
                          placeholder="הוסף טלפון"
                          ariaLabel="ערוך טלפון"
                          inputMode="tel"
                          dir="ltr"
                          className="text-sm text-muted-foreground font-normal"
                          validate={(v) => {
                            if (!v) return null;
                            const digits = v.replace(/\D/g, '');
                            if (digits.length < 9) return 'מספר טלפון לא תקין';
                            return null;
                          }}
                          onSave={async (next) => {
                            let normalized: string | null = null;
                            if (next) {
                              const digits = next.replace(/\D/g, '');
                              normalized = digits.startsWith('0') ? '972' + digits.slice(1) : digits.startsWith('972') ? digits : digits;
                            }
                            const { error } = await supabase.from('leads').update({ phone_number: normalized }).eq('id', selectedVoter.id);
                            if (error) throw error;
                            await queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
                            toast.success('הטלפון עודכן');
                          }}
                         />
                            </span>
                            {channels.map((c) => {
                              const base = `inline-flex items-center justify-center h-8 w-8 rounded-md bg-transparent transition-colors ${c.textClass} hover:bg-slate-100 ${c.active ? '' : 'opacity-55'}`;
                              const aria = { 'aria-label': c.label, title: c.label } as const;
                              return <button key={c.key} {...aria} type="button" onClick={c.onClick} className={base}>{c.icon}</button>;
                            })}
                            {phoneDigits && (
                              <a
                                href={`tel:+${phoneDigits}`}
                                aria-label="חיוג"
                                title="חיוג"
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-transparent text-slate-700 hover:bg-slate-100 transition-colors"
                              >
                                <PhoneIcon className="h-4 w-4" strokeWidth={1.8} />
                              </a>
                            )}
                            {/* Homely / WebTiv are read-only sources — no push action. */}

                            <LeadEnrichmentIconButton lead={selectedVoter} />
                            <button
                              type="button"
                              aria-label="מחק מתעניין"
                              title="מחק מתעניין"
                              onClick={() => setSingleDeleteId(selectedVoter.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-transparent text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                            </button>
                            <div className="flex items-center gap-1.5 mr-auto ps-2">
                              <Switch
                                className="group h-6 w-11 data-[state=checked]:bg-[#25D366]"
                                checked={!!selectedVoter.ai_autopilot}
                                onCheckedChange={async (checked) => {
                                  const { error } = await supabase
                                    .from('leads')
                                    .update({ ai_autopilot: checked } as any)
                                    .eq('id', selectedVoter.id);
                                  if (error) {
                                    toast.error('שגיאה בעדכון הסוכן הדיגיטלי');
                                    return;
                                  }
                                  toast.success(checked ? 'הסוכן הדיגיטלי הופעל' : 'הסוכן הדיגיטלי כובה');
                                  queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
                                }}
                              >
                                {/* Bot icon overlaid on the switch thumb; follows the same translate as the thumb */}
                                <span
                                  className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-5 items-center justify-center transition-transform group-data-[state=checked]:translate-x-5 group-data-[state=unchecked]:translate-x-0"
                                >
                                  <Bot className="h-3 w-3 text-[#25D366] group-data-[state=unchecked]:text-slate-400" strokeWidth={2.25} />
                                </span>
                              </Switch>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </SheetTitle>
                </SheetHeader>


                <div className="mt-6 space-y-6">


                  {/* Real Estate Sales Closer Grid — editable dropdowns, high-contrast labels */}
                  {(() => {
                    const prefs = ((selectedVoter as any).preferences ?? {}) as Record<string, any>;
                    const dealType: string = (selectedVoter as any).deal_type ?? '';
                    // Rent/sale budget captured by the AI intake lands in
                    // preferences.budget_max — derive the dropdown token from it
                    // so the field is never left unselected.
                    const budgetRange: string = prefs.budget_range || budgetTokenFromAmount(
                      Number(prefs.budget_max ?? 0),
                      ((selectedVoter as any).deal_type ?? '') === 'rent',
                    ) || '';
                    const source: string = prefs.source || prefs.lead_source || (selectedVoter as any).source || '';
                    const stage: string = (selectedVoter as any).lead_stage || selectedVoter.status || '';
                    const area: string = (selectedVoter as any).neighborhood || selectedVoter.city || '';

                    const dealTypeOpts = [
                      { v: 'sale', l: 'קנייה' }, { v: 'rent', l: 'שכירות' },
                      { v: 'investment', l: 'השקעה' }, { v: 'sell', l: 'מכירה' },
                    ];
                    // Rental leads see monthly-rent ranges (₪/month); buyers see sale-price ranges.
                    const isRental = dealType === 'rent';
                    const budgetOpts = isRental
                      ? [
                          { v: '0-3500',        l: 'עד 3,500 ₪ / חודש' },
                          { v: '3500-5000',     l: '3,500–5,000 ₪ / חודש' },
                          { v: '5000-7000',     l: '5,000–7,000 ₪ / חודש' },
                          { v: '7000-10000',    l: '7,000–10,000 ₪ / חודש' },
                          { v: '10000-15000',   l: '10,000–15,000 ₪ / חודש' },
                          { v: '15000+',        l: 'מעל 15,000 ₪ / חודש' },
                        ]
                      : [
                          { v: '0-1500000',       l: 'עד 1.5M ₪' },
                          { v: '1500000-2500000', l: '1.5M–2.5M ₪' },
                          { v: '2500000-4000000', l: '2.5M–4M ₪' },
                          { v: '4000000-6000000', l: '4M–6M ₪' },
                          { v: '6000000-10000000',l: '6M–10M ₪' },
                          { v: '10000000+',       l: 'מעל 10M ₪' },
                        ];
                    const stageOpts = [
                      { v: 'new', l: 'מתעניין חדש' },
                      { v: 'new_lead', l: 'מתעניין חדש' },
                      { v: 'contacted', l: 'יצר קשר' },
                      { v: 'engaging', l: 'בטיפול' },
                      { v: 'cold', l: 'מתעניין קר' }, { v: 'qualified', l: 'מתעניין מוסמך' },
                      { v: 'touring', l: 'בסיור נכסים' }, { v: 'offer_pending', l: 'ממתין להצעה' },
                      { v: 'negotiation', l: 'במשא ומתן' }, { v: 'closed', l: 'סגר עסקה' },
                    ];
                    const sourceOpts = [
                      { v: 'homely', l: 'הומלי' },
                      { v: 'shortlink', l: 'פוסט פייסבוק' },
                      { v: 'facebook_groups', l: 'פייסבוק קבוצות' }, { v: 'facebook', l: 'פייסבוק' },
                      { v: 'instagram', l: 'אינסטגרם' }, { v: 'whatsapp', l: 'וואטסאפ' },
                      { v: 'inbound_call', l: 'שיחה נכנסת' }, { v: 'yad2', l: 'יד2' },
                      { v: 'website', l: 'אתר' },
                      { v: 'manual', l: 'הוזן ידנית' },
                    ];
                    const areaOpts = [
                      'תל אביב', 'רמת גן', 'גבעתיים', 'הרצליה', 'רמת השרון', 'רעננה', 'כפר סבא',
                      'נתניה', 'ראשון לציון', 'חיפה', 'ירושלים', 'באר שבע',
                    ];

                    const saveLead = async (patch: Record<string, any>) => {
                      const { error } = await supabase.from('leads').update(patch as any).eq('id', selectedVoter.id);
                      if (error) { toast.error('שגיאה בעדכון'); return; }
                      toast.success('עודכן');
                      queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
                    };

                    const savePref = (pref: Record<string, any>) =>
                      saveLead({ preferences: { ...prefs, ...pref } });

                    const SelectCell = ({
                      icon, label, value, placeholder, options, onChange,
                    }: { icon: JSX.Element; label: string; value: string; placeholder: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) => {
                      // If AI/DB value is not in the preset list, inject it at top so the
                      // dropdown actually shows the selected value instead of going blank.
                      // The injected label uses the global Hebrew dictionaries so legacy
                      // tokens like `webtiv_stream` / `new_lead` never leak through.
                      const hasMatch = !!value && options.some((o) => o.v === value);
                      const dictLabel = SOURCE_LABEL_HE[value] || STAGE_LABEL_HE[value] || value;
                      const mergedOptions = !value || hasMatch
                        ? options
                        : [{ v: value, l: dictLabel }, ...options];
                      return (
                        <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 space-y-1.5">
                          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">{icon}{label}</p>
                          <Select value={value || undefined} onValueChange={onChange}>
                            <SelectTrigger className="h-8 text-sm font-semibold text-slate-900 bg-white">
                              <SelectValue placeholder={placeholder} />
                            </SelectTrigger>
                            <SelectContent>
                              {mergedOptions.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    };

                    const ownerLead = isOwnerLead(selectedVoter);

                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <SelectCell icon={<Tag className="h-3.5 w-3.5 text-slate-700" />} label="סוג עסקה" value={dealType} placeholder="בחר עסקה" options={dealTypeOpts} onChange={(v) => saveLead({ deal_type: v })} />
                          <SelectCell icon={<Radio className="h-3.5 w-3.5 text-slate-700" />} label="ערוץ הגעה" value={source} placeholder="בחר ערוץ" options={sourceOpts} onChange={(v) => savePref({ source: v, lead_source: v })} />
                          <SelectCell icon={<Target className="h-3.5 w-3.5 text-slate-700" />} label="סטטוס לקוח" value={stage} placeholder="בחר סטטוס" options={stageOpts} onChange={(v) => saveLead({ lead_stage: v })} />
                          {/* Buyer/renter preference fields — hidden entirely for property owners */}
                          {!ownerLead && (
                            <>
                              <SelectCell icon={<Wallet className="h-3.5 w-3.5 text-slate-700" />} label={isRental ? 'שכר דירה חודשי' : 'תקציב מבוקש'} value={budgetRange} placeholder={isRental ? 'בחר טווח שכר' : 'בחר תקציב'} options={budgetOpts} onChange={(v) => savePref({ budget_range: v })} />
                              <SelectCell icon={<Compass className="h-3.5 w-3.5 text-slate-700" />} label="אזור ביקוש מועדף" value={area} placeholder="בחר אזור" options={areaOpts.map((c) => ({ v: c, l: c }))} onChange={(v) => saveLead({ neighborhood: v })} />
                            </>
                          )}
                        </div>
                        {/* Owner-only: 13 Homely-style property fields, backed by the linked listing */}
                        {ownerLead && (
                          <OwnerPropertyGrid lead={selectedVoter as any} />
                        )}
                      </div>
                    );
                  })()}

                  {/* Demographics + Social (collapsed) + GreenAPI */}
                  <LeadEnrichmentPanel lead={selectedVoter} hideEnrichmentButton />








                  {/* Imported file columns — every column from the original
                      upload, including the ones we don't have a dedicated field
                      for, so the agent never loses context (budget, source, notes,
                      neighborhood, etc.). */}
                  {(() => {
                    const prefs = ((selectedVoter as any).preferences ?? {}) as Record<string, any>;
                    const extra = (prefs.extra_fields ?? {}) as Record<string, string>;
                    const entries = Object.entries(extra).filter(([, v]) => v != null && String(v).trim() !== '');
                    if (!entries.length) return null;
                    return (
                      <div>
                        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                          <FileSpreadsheet className="h-4 w-4" /> שדות מהקובץ שיובא
                          <Badge variant="outline" className="text-[10px] mr-auto">{entries.length}</Badge>
                        </h3>
                        <div className="rounded-lg border border-border/60 divide-y divide-border/60 text-xs">
                          {entries.map(([k, v]) => (
                            <div key={k} className="flex items-start gap-3 px-3 py-2">
                              <span className="font-medium text-muted-foreground min-w-[40%] break-words">{k}</span>
                              <span className="text-foreground break-words">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  


                  {/* Quick message templates (WhatsApp / SMS) */}
                  <QuickMessageCard
                    scope="lead"
                    leadId={selectedVoter.id}
                    phone={selectedVoter.phone_number}
                    vars={{ name: selectedVoter.full_name, city: selectedVoter.city }}
                  />

                  {/* Smart timeline + quick note + follow-up extraction */}
                  <SmartTimelineCard leadId={selectedVoter.id} title="ציר זמן מלא" />


                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> ייבוא מתעניינים
            </DialogTitle>
            <DialogDescription>סקירת בריאות הנתונים לפני ייבוא</DialogDescription>
          </DialogHeader>

          {/* Lead-kind selector — agent tags the entire batch before import.
              Buyer/Seller stay on the sale pipeline; Renter/Landlord move to rent. */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="text-xs font-semibold">סוג הרשימה</div>
            <div className="grid grid-cols-4 gap-1.5" dir="rtl">
              {([
                { v: 'buyer', label: 'קונים' },
                { v: 'seller', label: 'מוכרים' },
                { v: 'renter', label: 'שוכרים' },
                { v: 'landlord', label: 'משכירים' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setImportLeadKind(opt.v)}
                  className={`px-2 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                    importLeadKind === opt.v
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">כל הרשומות שייובאו יסומנו בסוג זה ויופנו לצינור המתאים (מכירה / השכרה).</p>
          </div>

          {importStats && (
            <div className="space-y-4">
              {importStats.missingPhone ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">עמודת טלפון חסרה</p>
                    <p className="text-xs mt-1">לא ניתן לייבא רשומות ללא עמודת טלפון. ודא שהקובץ כולל עמודה בשם: טלפון / סלולרי / Phone / Mobile.</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-success/5 border border-success/20 text-xs">
                  <p>
                    מזוהות <span className="font-bold text-success">{importStats.valid.toLocaleString('he-IL')}</span> רשומות עם השדות:{' '}
                    <span className="font-medium text-foreground">{importStats.detectedFields.join(', ')}</span>
                  </p>
                </div>
              )}

              <div className="p-4 rounded-lg bg-muted/30 text-center space-y-2">
                <p className="text-sm font-medium">בריאות נתונים</p>
                <div className="flex items-center gap-3">
                  <Progress value={importStats.healthPct} className="flex-1 h-3" />
                  <span className={`text-lg font-bold ${importStats.healthPct >= 70 ? 'text-success' : importStats.healthPct >= 40 ? 'text-primary' : 'text-destructive'}`}>
                    {importStats.healthPct}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-lg font-bold">{importStats.total}</p>
                  <p className="text-[10px] text-muted-foreground">סה״כ שורות</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-success/10 text-success">
                  <p className="text-lg font-bold">{importStats.valid}</p>
                  <p className="text-[10px]">חדשים</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-primary/10 text-primary">
                  <p className="text-lg font-bold">{importStats.duplicates}</p>
                  <p className="text-[10px]">עדכון (כפילויות)</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-destructive/10 text-destructive">
                  <p className="text-lg font-bold">{importStats.invalid}</p>
                  <p className="text-[10px]">לא תקינות</p>
                </div>
              </div>

              {importStats.invalid > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>שורות לא תקינות נפסלו: חסר שם או מספר טלפון ישראלי לא תקין.</p>
                </div>
              )}

              {importPreview.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-xs w-full justify-start">
                      <Eye className="h-3.5 w-3.5" />
                      תצוגה מקדימה ({importPreview.length} שורות)
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="overflow-x-auto rounded border border-border/50 mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">שם מלא</TableHead>
                            <TableHead className="text-xs">טלפון</TableHead>
                            <TableHead className="text-xs">עיר</TableHead>
                            <TableHead className="text-xs">נושא</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importPreview.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{row.full_name}</TableCell>
                              <TableCell className="text-xs font-mono" dir="ltr">{formatPhoneDisplay(row.phone_number)}</TableCell>
                              <TableCell className="text-xs">{row.city || '-'}</TableCell>
                              <TableCell className="text-xs">{row.interest_tag || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {importStats.valid > 50 && <p className="text-xs text-muted-foreground text-center py-2">מוצגות 50 מתוך {importStats.valid} שורות</p>}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleImportConfirm} disabled={importing || !importStats?.valid} className="gap-2 relative overflow-hidden">
              {importing && (
                <span
                  className="absolute inset-0 bg-primary/20 transition-all duration-300 ease-out"
                  style={{ width: `${importProgress}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {importing ? `${importProgress}%` : `ייבא ${importStats?.valid ?? 0} מתעניינים`}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Lead: a real row is inserted only after the broker fills the form. */}
      <NewLeadDialog open={addVoterOpen} onOpenChange={setAddVoterOpen} />

      <AlertDialog open={!!singleDeleteId} onOpenChange={(o) => { if (!deletingSingle && !o) setSingleDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">מחיקת מתעניין</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              האם אתה בטוח שברצונך למחוק ליד זה לצמיתות? הפעולה בלתי הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSingle}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingSingle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (singleDeleteId) deleteSingleLead(singleDeleteId); }}
            >
              {deletingSingle ? 'מוחק…' : 'מחק לצמיתות'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HomelyBulkSyncDialog
        open={homelyContactsSyncOpen}
        onOpenChange={setHomelyContactsSyncOpen}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
          queryClient.invalidateQueries({ queryKey: ['leads-total'] });
          // Immediately pull WA profile pictures for the freshly synced contacts.
          supabase.functions.invoke('fetch-wa-avatars', { body: { limit: 2000, owner_id: activeWorkspaceId } }).catch(() => {});
        }}
        mode="contacts"
      />


      <AlertDialog open={deleteDialogOpen} onOpenChange={(o) => { if (!deleting) setDeleteDialogOpen(o); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">מחיקה לצמיתות</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <div>
                  אתה עומד למחוק לצמיתות{' '}
                  <span className="font-bold text-destructive">
                    {selectedIds.size.toLocaleString('he-IL')}
                  </span>{' '}
                  מתעניינים. פעולה זו <span className="font-bold">בלתי הפיכה</span> ותסיר את כל ההיסטוריה, ההודעות והפגישות המשויכות.
                </div>
                {selectedIds.size > 50 && !isAdmin && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    מחיקה של מעל 50 רשומות חסומה עבור משתמש שאינו מנהל. פנה למנהל המערכת.
                  </div>
                )}
                <div className="pt-2">
                  הקלד <span className="font-mono font-bold">DELETE</span> כדי לאשר:
                </div>
                <Input
                  dir="ltr"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  disabled={deleting}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmBatchDelete(); }}
              disabled={
                deleting ||
                deleteConfirmText.trim() !== 'DELETE' ||
                (selectedIds.size > 50 && !isAdmin)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'מוחק...' : `מחק ${selectedIds.size.toLocaleString('he-IL')} לצמיתות`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LeadCRM;
