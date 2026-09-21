// Broker-side Affiliate Network management.
//
// Tab 1 "נכסים ותגמולים" — flip a property into the affiliate marketplace and
//   set the reward (fixed ILS or percent of commission) paid on a signed deal.
// Tab 2 "אנשי קשר משותפים" — full tracking CRM of every affiliate-generated
//   referral: status funnel, source affiliate, linked lead, and settlement.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ViewModeSwitch } from '@/components/ui/view-mode-switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Banknote, BedDouble, Building2, ClipboardList, Handshake, LayoutGrid, List, MapPin, MessageCircle, Phone, Ruler, Search, SquareArrowOutUpLeft, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';

import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_ORDER,
  accruedEarnings,
  useBrokerSubmissions,
  useUpdateSubmission,
  type SubmissionStatus,
  REFERRAL_STATUS_LABELS,
  REFERRAL_STATUS_ORDER,
  SETTLEMENT_LABELS,
  formatReward,
  useBrokerAffiliateListings,
  useBrokerReferrals,
  useSetAffiliateReward,
  useUpdateReferral,
  type BrokerAffiliateListing,
  type ReferralStatus,
  type RewardType,
  type SettlementStatus,
} from '@/hooks/useAffiliate';
import { fmtILS } from '@/lib/formatCurrency';
import { PropertyThumb, propertyFullAddress } from '@/components/leads/LinkedPropertiesField';
import ContactAvatar from '@/components/contacts/ContactAvatar';
import type { UnifiedResult } from '@/lib/propertySearch';
import { ResultTable } from '@/pages/Properties';
import AffiliatePortal from '@/pages/AffiliatePortal';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { publicUrl } from '@/lib/publicUrl';

const AFFILIATE_SCROLL_KEY = 'affiliate-network:scroll-y';

function listingPhotos(listing: BrokerAffiliateListing): string[] {
  const urls: string[] = [];
  if (listing.image_url) urls.push(listing.image_url);
  if (Array.isArray(listing.media_photos)) {
    for (const item of listing.media_photos) {
      if (typeof item === 'string' && item.trim()) urls.push(item.trim());
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const candidate = row.url ?? row.src ?? row.image_url ?? row.image;
        if (typeof candidate === 'string' && candidate.trim()) urls.push(candidate.trim());
      }
    }
  }
  return [...new Set(urls)];
}

function toUnifiedResult(listing: BrokerAffiliateListing): UnifiedResult {
  const dealType = listing.deal_type === 'rent' ? 'rent' : 'sale';
  return {
    key: `mine:${listing.id}`,
    source: 'mine',
    sources: ['mine'],
    localId: listing.id,
    title: listing.property_title || propertyFullAddress(listing) || 'נכס ללא כותרת',
    description: listing.description,
    price: listing.asking_price,
    city: listing.city,
    address: propertyFullAddress(listing),
    neighborhood: listing.neighborhood,
    rooms: listing.rooms ?? null,
    size_sqm: listing.sqm ?? null,
    floor: listing.floor,
    photos: listingPhotos(listing),
    url: listing.source_url,
    listing_type: dealType,
    property_type: 'apartment',
    raw: listing,
    created_at: listing.affiliate_approved_at,
    updated_at: listing.affiliate_approved_at,
  };
}

function RewardDialog({
  listing,
  open,
  onOpenChange,
}: {
  listing: BrokerAffiliateListing | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const save = useSetAffiliateReward();
  const [enabled, setEnabled] = useState(false);
  const [rewardType, setRewardType] = useState<RewardType>('fixed');
  const [amount, setAmount] = useState('0');
  const [tier1, setTier1] = useState('0');
  const [tier2, setTier2] = useState('0');
  const [tier3Type, setTier3Type] = useState<RewardType>('fixed');
  const [tier3, setTier3] = useState('0');
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Sync form state to the listing being edited (render-time, no effect needed).
  if (listing && hydratedFor !== listing.id) {
    setHydratedFor(listing.id);
    setEnabled(listing.affiliate_enabled);
    setRewardType(listing.affiliate_reward_type ?? 'fixed');
    setAmount(String(listing.affiliate_reward_amount ?? 0));
    setTier1(String(listing.affiliate_tier1_amount ?? 0));
    setTier2(String(listing.affiliate_tier2_amount ?? 0));
    setTier3Type((listing.affiliate_tier3_type ?? 'fixed') as RewardType);
    setTier3(String(listing.affiliate_tier3_amount ?? 0));
  }

  const num = (v: string) => Number(v) || 0;
  const clean = (v: string) => v.replace(/[^\d.]/g, '');

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            תגמול שותפים · {listing.property_title || 'נכס'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">פתוח לשיווק ע״י שותפים</div>
              <div className="text-[11px] text-slate-500">הנכס יופיע בזירת השותפים</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">מודל עמלה ב-3 שלבים</div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <div className="text-[12px] font-semibold text-slate-900">שלב 1</div>
                <Label className="text-[11px] font-normal text-slate-500">
                  ליד דיגיטלי לנכס הספציפי (₪)
                </Label>
                <Input value={tier1} inputMode="decimal" onChange={(e) => setTier1(clean(e.target.value))} />
              </div>

              <div className="space-y-1.5">
                <div className="text-[12px] font-semibold text-slate-900">שלב 2</div>
                <Label className="text-[11px] font-normal text-slate-500">
                  ליד שאומת אנושית בשיחת טלפון (₪)
                </Label>
                <Input value={tier2} inputMode="decimal" onChange={(e) => setTier2(clean(e.target.value))} />
              </div>

              <div className="space-y-1.5">
                <div className="text-[12px] font-semibold text-slate-900">שלב 3</div>
                <Label className="text-[11px] font-normal text-slate-500">בונוס סגירת עסקה</Label>
                <div className="flex items-center gap-2">
                  <Select value={tier3Type} onValueChange={(v) => setTier3Type(v as RewardType)}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">סכום קבוע (₪)</SelectItem>
                      <SelectItem value="percent">אחוז מהעמלה (%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={tier3} inputMode="decimal" onChange={(e) => setTier3(clean(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  listingId: listing.id,
                  enabled,
                  rewardType,
                  rewardAmount: Number(amount) || 0,
                  tier1Amount: num(tier1),
                  tier2Amount: num(tier2),
                  tier3Type,
                  tier3Amount: num(tier3),
                },
                {
                  onSuccess: () => {
                    toast.success('התגמול נשמר');
                    onOpenChange(false);
                  },
                  onError: () => toast.error('השמירה נכשלה'),
                },
              )
            }
          >
            {save.isPending ? 'שומר...' : 'שמירה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BrokerAffiliateNetwork() {
  const navigate = useNavigate();
  const { data: listings = [], isLoading: listingsLoading } = useBrokerAffiliateListings();
  const { data: referrals = [], isLoading: refsLoading } = useBrokerReferrals();
  const { data: submissions = [], isLoading: subsLoading } = useBrokerSubmissions();
  const updateSubmission = useUpdateSubmission();
  const updateReferral = useUpdateReferral();
  const quickSave = useSetAffiliateReward();

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [editing, setEditing] = useState<BrokerAffiliateListing | null>(null);
  // Removing a property from partner marketing is destructive for partners who
  // are already promoting it, so it always goes through a confirmation.

  useEffect(() => {
    if (listingsLoading || refsLoading || subsLoading) return;
    const stored = sessionStorage.getItem(AFFILIATE_SCROLL_KEY);
    if (!stored) return;
    sessionStorage.removeItem(AFFILIATE_SCROLL_KEY);
    const top = Number(stored);
    if (Number.isFinite(top)) requestAnimationFrame(() => window.scrollTo({ top, behavior: 'auto' }));
  }, [listingsLoading, refsLoading, subsLoading]);

  const openLead = (leadId: string) => {
    sessionStorage.setItem(AFFILIATE_SCROLL_KEY, String(window.scrollY));
    navigate(`/lead-crm/${leadId}`, { state: { returnTo: '/affiliate-network' } });
  };

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) =>
      [l.property_title, l.address, l.city].some((f) => (f ?? '').toLowerCase().includes(q)),
    );
  }, [listings, search]);

  const totals = useMemo(() => {
    const signed = referrals.filter((r) => r.status === 'deal_signed');
    const owed = signed
      .filter((r) => r.settlement_status !== 'paid' && r.reward_type === 'fixed')
      .reduce((sum, r) => sum + Number(r.reward_amount ?? 0), 0);
    return {
      active: listings.filter((l) => l.affiliate_enabled).length,
      referrals: referrals.length,
      signed: signed.length,
      owed,
    };
  }, [listings, referrals]);

  return (
    <>
      <div className="space-y-5 p-4" dir="rtl">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">רשת השותפים</h1>
          <p className="text-sm text-slate-500">
            קבעו תגמול לכל נכס, ועקבו אחרי כל איש קשר שמגיע דרך שותפי השיווק.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'נכסים פתוחים לשותפים', value: String(totals.active), icon: Building2, color: 'text-deal-blue' },
            { label: 'נכסים בשיווק', value: String(totals.referrals), icon: Users, color: 'text-destructive' },
            { label: 'עסקאות דרך שותפים', value: String(totals.signed), icon: Handshake, color: 'text-success' },
            { label: 'עמלות לתשלום', value: fmtILS(totals.owed), icon: Banknote, color: 'text-warning' },
          ].map((s) => (
            <Card key={s.label} className="realtyz-affiliate-kpi border-slate-200">
              <CardContent className="flex flex-col items-center justify-center gap-1.5 p-3.5 text-center">
                <s.icon className={`h-6 w-6 shrink-0 ${s.color}`} />
                <div className="kpi-label text-slate-500">{s.label}</div>
                <div className={`kpi-value font-bold ${s.color}`}>
                  <bdi dir="ltr">{s.value}</bdi>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="rewards">
          <TabsList className="mx-auto grid h-[44px] w-full max-w-2xl grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
            <TabsTrigger value="rewards" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[14px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">נכסים</TabsTrigger>
            <TabsTrigger value="tracking" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[14px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">בשיווק</TabsTrigger>
            <TabsTrigger value="submissions" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[14px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">לידים</TabsTrigger>
          </TabsList>

          <TabsContent value="rewards" className="space-y-4 pt-4">
            <div className="flex items-center gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="חיפוש נכס"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 ps-10 pe-4"
                />
              </div>
              <div className="ms-auto inline-flex items-center">
                <ViewModeSwitch isGrid={viewMode === 'grid'} onToggle={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')} />
              </div>
            </div>

            {listingsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filteredListings.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  לא נמצאו נכסים בחשבון זה.
                </CardContent>
              </Card>
            ) : viewMode === 'table' ? (
              <ResultTable
                results={filteredListings.map(toUnifiedResult)}
                importingKey={null}
                onSelect={(result) => {
                  if (result.localId) {
                    const surface = document.querySelector<HTMLElement>('.realtyz-main-surface');
                    sessionStorage.setItem(AFFILIATE_SCROLL_KEY, String(surface?.scrollTop ?? window.scrollY));
                    navigate(`/properties/${result.localId}`, {
                      state: { propertySnapshot: result, returnTo: '/affiliate-network' },
                    });
                  }
                }}
                publishedLabel="פורסם לרשת"
                publishedAt={(result) => filteredListings.find((item) => item.id === result.localId)?.affiliate_approved_at ?? null}
                affiliateSortValue={(result) => filteredListings.find((item) => item.id === result.localId)?.affiliate_enabled ? 1 : 0}
                commissionSortValue={(result) => {
                  const listing = filteredListings.find((item) => item.id === result.localId);
                  if (!listing) return 0;
                  return Number(listing.affiliate_tier1_amount ?? 0) + Number(listing.affiliate_tier2_amount ?? 0)
                    + (listing.affiliate_tier3_type === 'fixed' ? Number(listing.affiliate_tier3_amount ?? 0) : 0);
                }}
                onCampaign={(result) => {
                  if (result.localId) navigate(`/campaigns?tab=create&channel=facebook&properties=${result.localId}&listing=${result.localId}`);
                }}
                onEdit={(result) => {
                  if (result.localId) navigate(`/properties/${result.localId}`, { state: { returnTo: '/affiliate-network', openEdit: true } });
                }}
                // First column: shared properties are green; clicking always
                // opens the commissions dialog with the sharing switch.
                affiliateCell={(result) => {
                  const listing = filteredListings.find((item) => item.id === result.localId);
                  if (!listing) return null;
                  const shared = Boolean(listing.affiliate_enabled);
                  // Plain-text commission amounts under a shared (green) button —
                  // zero tiers stay hidden, no pills.
                  const tierTexts: Array<{ value: string; label: string; Icon: typeof ClipboardList }> = [];
                  if (shared) {
                    const money = (n: number) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
                    const t1 = Number(listing.affiliate_tier1_amount ?? 0);
                    const t2 = Number(listing.affiliate_tier2_amount ?? 0);
                    const t3 = Number(listing.affiliate_tier3_amount ?? 0);
                    const t3Type = (listing.affiliate_tier3_type ?? 'fixed') as RewardType;
                    if (t1) tierTexts.push({ value: money(t1), label: 'טופס דיגיטלי', Icon: ClipboardList });
                    if (t2) tierTexts.push({ value: money(t2), label: 'שיחת WhatsApp', Icon: MessageCircle });
                    if (t3) tierTexts.push({ value: t3Type === 'percent' ? `${t3}%` : money(t3), label: 'שיחת טלפון', Icon: Phone });
                  }
                  return (
                    <div className="flex flex-col items-center gap-1">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant={shared ? 'default' : 'outline'}
                          className={`h-8 w-8 ${shared ? 'bg-success text-success-foreground hover:bg-success/90' : ''}`}
                          title={shared ? 'עריכת עמלות והפסקת שיווק שותפים' : 'פתיחת הנכס לשיווק שותפים'}
                          aria-label={shared ? 'עריכת עמלות' : 'פתיחת הנכס לשיווק שותפים'}
                          onClick={() => setEditing(listing)}
                        >
                          <Handshake className="h-4 w-4" />
                        </Button>
                        {shared ? <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="פתיחת עמוד הנכס" aria-label="פתיחת עמוד הנכס"><a href={publicUrl(`/p/${listing.id}`)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><SquareArrowOutUpLeft className="h-4 w-4" /></a></Button> : null}
                      </div>
                      {tierTexts.length > 0 ? (
                        <div className="space-y-0.5 text-[11px] font-semibold whitespace-nowrap text-muted-foreground">
                          {tierTexts.map(({ value, label, Icon }) => <div key={label} className="flex items-center justify-center gap-1" title={label}><Icon className="h-3 w-3" /><bdi dir="ltr">{value}</bdi></div>)}
                        </div>
                      ) : null}
                    </div>
                  );
                }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredListings.map((l) => (
                  <Card
                    key={l.id}
                    className="group cursor-pointer overflow-hidden border-slate-200 transition-shadow hover:shadow-lg"
                    onClick={() => navigate(`/properties/${l.id}`, {
                      state: { propertySnapshot: toUnifiedResult(l), returnTo: '/affiliate-network' },
                    })}
                  >
                    <div className="border-b px-4 pb-2 pt-3">
                      <h3 className="truncate text-base font-semibold" title={l.property_title || undefined}>
                        {l.property_title || 'נכס ללא כותרת'}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-normal">{propertyFullAddress(l)}</span>
                      </p>
                    </div>
                    <div className="aspect-[16/10] overflow-hidden bg-muted">
                      {listingPhotos(l)[0] ? (
                        <img
                          src={listingPhotos(l)[0]}
                          alt={propertyFullAddress(l)}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין תמונה</div>
                      )}
                    </div>
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {l.rooms ? <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{l.rooms} חד׳</span> : null}
                        {l.sqm ? <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{l.sqm} מ״ר</span> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        {l.asking_price ? (
                          <span className="text-lg font-bold text-brand-navy">
                            <bdi dir="ltr">{fmtILS(l.asking_price)}</bdi>
                          </span>
                        ) : null}
                        {l.affiliate_enabled && (
                          <Badge variant="secondary">
                            {formatReward(l.affiliate_reward_type, l.affiliate_reward_amount)}
                          </Badge>
                        )}
                        <div className="ms-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                          <Label htmlFor={`affiliate-${l.id}`} className="text-xs text-muted-foreground">שיתוף שותפים</Label>
                          <Switch
                            id={`affiliate-${l.id}`}
                            checked={l.affiliate_enabled}
                            disabled={quickSave.isPending}
                            onCheckedChange={(enabled) => quickSave.mutate({
                              listingId: l.id,
                              enabled,
                              rewardType: l.affiliate_reward_type ?? 'fixed',
                              rewardAmount: Number(l.affiliate_reward_amount ?? 0),
                              tier1Amount: Number(l.affiliate_tier1_amount ?? 0),
                              tier2Amount: Number(l.affiliate_tier2_amount ?? 0),
                              tier3Type: l.affiliate_tier3_type ?? 'fixed',
                              tier3Amount: Number(l.affiliate_tier3_amount ?? 0),
                            }, { onError: () => toast.error('העדכון נכשל') })}
                          />
                        </div>
                        <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setEditing(l); }}>
                          קביעת תגמול
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="submissions" className="space-y-2.5 pt-4">
            {subsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : submissions.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  שותפים עוד לא הגישו לידים לנכסים שלכם.
                </CardContent>
              </Card>
            ) : (
              submissions.map((s) => (
                <Card key={s.id} className="border-slate-200">
                  <CardContent className="space-y-3 p-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        {s.listing ? <PropertyThumb p={s.listing} size={52} /> : null}
                      <div className="min-w-0 flex-1">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto max-w-full justify-start gap-2 p-0 text-sm font-bold text-slate-900 hover:bg-transparent"
                            disabled={!s.lead?.id}
                            onClick={() => s.lead?.id && openLead(s.lead.id)}
                          >
                            <ContactAvatar name={s.lead?.full_name || s.lead_name} imageUrl={s.lead?.profile_picture_url} className="h-8 w-8" />
                            <span className="truncate">{s.lead?.full_name || s.lead_name}</span>
                          {s.lead_phone ? <> · <bdi dir="ltr" className="font-normal text-slate-500">{s.lead_phone}</bdi></> : null}
                          </Button>
                        <div className="truncate text-[11px] text-slate-500">
                          {s.listing?.property_title || 'נכס'} · שותף: {s.affiliate?.display_name || 'שותף ללא שם'}
                          {' · '}
                          {new Date(s.created_at).toLocaleDateString('he-IL')}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-emerald-700">
                        <bdi dir="ltr">{fmtILS(Number(s.partner_net_amount ?? accruedEarnings(s) * 0.8))}</bdi>
                      </div>
                    </div>

                    {s.notes ? (
                      <div className="rounded-md bg-slate-50 px-2.5 py-2 text-[12px] text-slate-600 ring-1 ring-slate-200">
                        {s.notes}
                      </div>
                    ) : null}

                    <CommissionTierBadges
                      tiers={{
                        tier1: Number(s.tier1_amount),
                        tier2: Number(s.tier2_amount),
                        tier3Type: s.tier3_type,
                        tier3: Number(s.tier3_amount),
                      }}
                      compact
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={s.status}
                        onValueChange={(v) =>
                          updateSubmission.mutate(
                            { row: s, status: v as SubmissionStatus },
                            {
                              onSuccess: () => toast.success('הסטטוס עודכן'),
                              onError: () => toast.error('העדכון נכשל'),
                            },
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px] text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SUBMISSION_STATUS_ORDER.map((st) => (
                            <SelectItem key={st} value={st}>{SUBMISSION_STATUS_LABELS[st]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={s.settlement_status}
                        onValueChange={(v) =>
                          updateSubmission.mutate(
                            { row: s, settlementStatus: v as SettlementStatus },
                            {
                              onSuccess: () => toast.success('ההסדרה עודכנה'),
                              onError: () => toast.error('העדכון נכשל'),
                            },
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px] text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SETTLEMENT_LABELS) as SettlementStatus[]).map((st) => (
                            <SelectItem key={st} value={st}>{SETTLEMENT_LABELS[st]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="tracking" className="pt-4">
            {refsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : referrals.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא נכנסו אנשי קשר דרך שותפים.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {referrals.map((r) => (
                  <Card key={r.id} className="border-slate-200">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        {r.listing ? <PropertyThumb p={r.listing} size={52} /> : null}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">
                            {r.listing?.property_title || 'נכס לא ידוע'}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            שותף: {r.affiliate?.display_name || 'שותף ללא שם'}
                            {' · '}
                            {r.clicks} כניסות
                          </div>
                        </div>

                        <div className="text-sm font-bold text-emerald-700">
                          {formatReward(r.reward_type, r.reward_amount)}
                        </div>
                      </div>

                      {r.lead && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => openLead(r.lead?.id ?? '')}
                          className="h-auto w-full justify-start gap-2 bg-slate-50 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                        >
                          <ContactAvatar name={r.lead.full_name} imageUrl={r.lead.profile_picture_url} className="h-8 w-8" />
                          <span>{r.lead.full_name || 'איש קשר'}</span>
                          {r.lead.phone ? <bdi dir="ltr" className="text-slate-500">{r.lead.phone}</bdi> : null}
                        </Button>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={r.status}
                          onValueChange={(v) =>
                            updateReferral.mutate(
                              { id: r.id, status: v as ReferralStatus },
                              {
                                onSuccess: () => toast.success('הסטטוס עודכן'),
                                onError: () => toast.error('העדכון נכשל'),
                              },
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[170px] text-[12px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REFERRAL_STATUS_ORDER.map((s) => (
                              <SelectItem key={s} value={s}>{REFERRAL_STATUS_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={r.settlement_status}
                          onValueChange={(v) =>
                            updateReferral.mutate(
                              { id: r.id, settlementStatus: v as SettlementStatus },
                              {
                                onSuccess: () => toast.success('מצב ההסדרה עודכן'),
                                onError: () => toast.error('העדכון נכשל'),
                              },
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[160px] text-[12px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(SETTLEMENT_LABELS) as SettlementStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>{SETTLEMENT_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <span className="text-[11px] text-slate-400">
                          נפתח {new Date(r.created_at).toLocaleDateString('he-IL')}
                          {r.settled_at ? ` · שולם ${new Date(r.settled_at).toLocaleDateString('he-IL')}` : ''}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <RewardDialog listing={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />

      </div>
    </>
  );
}

export default function AffiliateNetwork() {
  const { isAffiliateOnly } = useUserRole();
  const { isPartnerMode } = useAppMode();
  return isAffiliateOnly || isPartnerMode ? <AffiliatePortal /> : <BrokerAffiliateNetwork />;
}
