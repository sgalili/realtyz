// Broker-side Affiliate Network management.
//
// Tab 1 "נכסים ותגמולים" — flip a property into the affiliate marketplace and
//   set the reward (fixed ILS or percent of commission) paid on a signed deal.
// Tab 2 "אנשי קשר משותפים" — full tracking CRM of every affiliate-generated
//   referral: status funnel, source affiliate, linked lead, and settlement.
import PropertyReferralButton from "@/components/public/PropertyReferralButton";
import { returnState } from "@/lib/returnNav";
import { useEffect, useMemo, useState } from "react";
import { RewardDialog } from "@/components/affiliate/RewardDialog";
import LeftoverLeadsDialog from "@/components/affiliate/LeftoverLeadsDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ViewModeSwitch } from "@/components/ui/view-mode-switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectModeToggle } from "@/components/ui/multi-select-controls";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  ClipboardList,
  Handshake,
  LayoutGrid,
  List,
  ListChecks,
  MapPin,
  Phone,
  Ruler,
  Search,
  SquareArrowOutUpLeft,
  TrendingUp,
  Trophy,
  Trash2,
  XCircle,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/properties/WhatsAppIcon";
import { useNavigate } from "react-router-dom";
import CommissionTierBadges from "@/components/affiliate/CommissionTierBadges";
import LeadTypeFilterButton from "@/components/affiliate/LeadTypeFilterButton";
import {
  EMPTY_LEAD_FILTER,
  EMPTY_PROPERTY_FILTER,
  leadFilterActiveCount,
  leadTierAmounts,
  matchesLeadFilter,
  matchesPropertyFilter,
  propertyFilterActiveCount,
  type LeadFilterState,
  type PropertyFilterState,
} from "@/lib/leadTypeFilter";
import LeadQuestionsDialog from "@/components/affiliate/LeadQuestionsDialog";
import { defaultQuestions, deriveContactOptions, leadCost } from "@/lib/leadTiers";

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
} from "@/hooks/useAffiliate";
import { fmtILS } from "@/lib/formatCurrency";
import { PropertyThumb, propertyFullAddress } from "@/components/leads/LinkedPropertiesField";
import ContactAvatar from "@/components/contacts/ContactAvatar";
import type { UnifiedResult } from "@/lib/propertySearch";
import { ResultTable } from "@/pages/Properties";
import { useListingPublishers } from "@/hooks/useListingPublishers";
import { PropertyShareMenu } from "@/components/properties/PropertyShareMenu";
import AffiliatePortal from "@/pages/AffiliatePortal";
import { useUserRole } from "@/hooks/useUserRole";
import { useAppMode } from "@/hooks/useAppMode";
import { publicUrl } from "@/lib/publicUrl";
import { supabase } from "@/integrations/supabase/client";
import { useDeleteListings } from "@/hooks/useDeleteListings";
import { PropertyDeleteDialog } from "@/components/properties/PropertyDeleteDialog";
import AffiliateAutomationCards from "@/components/affiliate/AffiliateAutomationCards";
import { PartnerPageIntroduction } from '@/components/affiliate/PartnerProgramIntro';

const AFFILIATE_SCROLL_KEY = "affiliate-network:scroll-y";

function listingPhotos(listing: BrokerAffiliateListing): string[] {
  const urls: string[] = [];
  if (listing.image_url) urls.push(listing.image_url);
  if (Array.isArray(listing.media_photos)) {
    for (const item of listing.media_photos) {
      if (typeof item === "string" && item.trim()) urls.push(item.trim());
      else if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const candidate = row.url ?? row.src ?? row.image_url ?? row.image;
        if (typeof candidate === "string" && candidate.trim()) urls.push(candidate.trim());
      }
    }
  }
  return [...new Set(urls)];
}

function toUnifiedResult(listing: BrokerAffiliateListing): UnifiedResult {
  const dealType = listing.deal_type === "rent" ? "rent" : "sale";
  return {
    key: `mine:${listing.id}`,
    source: "mine",
    sources: ["mine"],
    localId: listing.id,
    title: listing.property_title || propertyFullAddress(listing) || "נכס ללא כותרת",
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
    property_type: "apartment",
    raw: listing,
    created_at: listing.affiliate_approved_at,
    updated_at: listing.affiliate_approved_at,
  };
}


function BrokerAffiliateNetwork() {
  const navigate = useNavigate();
  const { data: listings = [], isLoading: listingsLoading } = useBrokerAffiliateListings();
  const { data: referrals = [], isLoading: refsLoading } = useBrokerReferrals();
  const referralListingIds = useMemo(
    () => [...new Set(referrals.map((r: any) => r.listing?.id).filter(Boolean))] as string[],
    [referrals],
  );
  const { data: referralPublishers } = useListingPublishers(referralListingIds);
  const { data: submissions = [], isLoading: subsLoading } = useBrokerSubmissions();
  const queryClient = useQueryClient();
  const updateSubmission = useUpdateSubmission();
  const updateReferral = useUpdateReferral();
  const quickSave = useSetAffiliateReward();

  const [search, setSearch] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") ?? "" : ""));
  const [trackingSearch, setTrackingSearch] = useState("");
  const [submissionsSearch, setSubmissionsSearch] = useState("");
  const [leadFilter, setLeadFilter] = useState<LeadFilterState>(EMPTY_LEAD_FILTER);
  const [propertyFilter, setPropertyFilter] = useState<PropertyFilterState>(EMPTY_PROPERTY_FILTER);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [editing, setEditing] = useState<BrokerAffiliateListing | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const deleteListings = useDeleteListings();
  // Removing a property from partner marketing is destructive for partners who
  // are already promoting it, so it always goes through a confirmation.

  useEffect(() => {
    if (listingsLoading || refsLoading || subsLoading) return;
    const stored = sessionStorage.getItem(AFFILIATE_SCROLL_KEY);
    if (!stored) return;
    sessionStorage.removeItem(AFFILIATE_SCROLL_KEY);
    const top = Number(stored);
    if (Number.isFinite(top)) requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
  }, [listingsLoading, refsLoading, subsLoading]);

  const openLead = (leadId: string) => {
    sessionStorage.setItem(AFFILIATE_SCROLL_KEY, String(window.scrollY));
    navigate(`/lead-crm/${leadId}`, { state: { returnTo: "/affiliate-network" } });
  };

  const toggleSelectedListing = (id: string) => {
    setSelectedListingIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmDeleteListings = async () => {
    const ids = deleteTargetIds;
    if (!ids.length) return;
    try {
      await deleteListings.mutateAsync(ids);
      setSelectedListingIds(new Set());
      setMultiSelectMode(false);
      setDeleteTargetIds([]);
      toast.success(ids.length > 1 ? `${ids.length} נכסים נמחקו` : "הנכס נמחק");
    } catch (error) {
      toast.error("מחיקת הנכס נכשלה", { description: error instanceof Error ? error.message : undefined });
    }
  };

  // Filter option lists come straight off the broker's own properties.
  const filterCities = useMemo(
    () =>
      [...new Set(listings.map((l) => l.city).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), "he"),
      ) as string[],
    [listings],
  );
  const filterNeighborhoods = useMemo(() => {
    const pool = propertyFilter.city === "all" ? listings : listings.filter((l) => l.city === propertyFilter.city);
    return [...new Set(pool.map((l) => l.neighborhood).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), "he"),
    ) as string[];
  }, [listings, propertyFilter.city]);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const leadActive = leadFilterActiveCount(leadFilter) > 0;
    const propsActive = propertyFilterActiveCount(propertyFilter) > 0;
    if (!q && !leadActive && !propsActive) return listings;
    return listings.filter((l) => {
      const row = l as unknown as Record<string, unknown>;
      const matchesText = !q || [l.property_title, l.address, l.city].some((f) => (f ?? "").toLowerCase().includes(q));
      if (!matchesText) return false;
      if (leadActive && !matchesLeadFilter(leadTierAmounts(row), leadFilter)) return false;
      return !propsActive || matchesPropertyFilter(row, propertyFilter);
    });
  }, [listings, search, leadFilter, propertyFilter]);

  // Marketing and lead tabs each get their own text search.
  const filteredReferrals = useMemo(() => {
    const q = trackingSearch.trim().toLowerCase();
    if (!q) return referrals;
    return referrals.filter((r) =>
      [
        r.listing?.property_title,
        r.listing?.address,
        r.listing?.city,
        r.affiliate?.display_name,
        r.lead?.full_name,
      ].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [referrals, trackingSearch]);

  const filteredSubmissions = useMemo(() => {
    const q = submissionsSearch.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) =>
      [s.lead?.full_name, s.lead_name, s.lead_phone, s.listing?.property_title, s.affiliate?.display_name].some((f) =>
        (f ?? "").toLowerCase().includes(q),
      ),
    );
  }, [submissions, submissionsSearch]);

  return (
    <>
      {/* Tabs sit at the same height as on the inbox and campaigns pages:
          no local page title block, matching top offset. */}
      <div className="-mt-[25px] w-full max-w-full min-w-0 space-y-5" dir="rtl">
        <AffiliateAutomationCards />
        <Tabs defaultValue="rewards">
          <div className="flex items-center gap-2">
          <TabsList className="mx-auto grid flex-1 h-[44px] w-full max-w-2xl grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
            <TabsTrigger
              value="rewards"
              className="h-9 min-w-0 rounded-lg px-2 py-2 text-[14px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              נכסים ({listings.length})
            </TabsTrigger>
            <TabsTrigger
              value="tracking"
              className="h-9 min-w-0 rounded-lg px-2 py-2 text-[14px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              בשיווק ({referrals.length})
            </TabsTrigger>
            <TabsTrigger
              value="submissions"
              className="h-9 min-w-0 rounded-lg px-2 py-2 text-[14px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              לידים ({submissions.length})
            </TabsTrigger>
          </TabsList>
          <LeftoverLeadsDialog />
          </div>

          <TabsContent value="rewards" className="space-y-4 pt-4">
            <div className="flex items-center gap-3">
              <SelectModeToggle total={filteredListings.length} active={multiSelectMode} count={selectedListingIds.size}
                onToggle={() => { setMultiSelectMode(v => !v); setSelectedListingIds(new Set()); }}
                onSelectAll={() => setSelectedListingIds(new Set(filteredListings.map(l => l.id)))} />
              {/* Filter button at the start of the field, like the public board. */}
              <div className="relative flex h-10 max-w-sm flex-1 items-center rounded-md border border-input bg-background">
                <span className="absolute start-2 top-1/2 z-10 flex -translate-y-1/2">
                  <LeadTypeFilterButton
                    state={leadFilter}
                    onChange={setLeadFilter}
                    propertyState={propertyFilter}
                    onPropertyChange={setPropertyFilter}
                    cities={filterCities}
                    neighborhoods={filterNeighborhoods}
                    propertyTypes={[]}
                  />
                </span>
                <Input
                  placeholder="חיפוש נכס"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 flex-1 border-0 bg-transparent ps-11 pe-3 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="ms-auto inline-flex items-center">
                <ViewModeSwitch
                  isGrid={viewMode === "grid"}
                  onToggle={() => setViewMode(viewMode === "grid" ? "table" : "grid")}
                />
              </div>
            </div>

            {multiSelectMode && selectedListingIds.size > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <span className="text-sm font-semibold">נבחרו {selectedListingIds.size} נכסים</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => setDeleteTargetIds(Array.from(selectedListingIds))}
                >
                  <Trash2 className="h-4 w-4" /> מחיקת הנבחרים
                </Button>
              </div>
            ) : null}

            {listingsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filteredListings.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">לא נמצאו נכסים בחשבון זה.</CardContent>
              </Card>
            ) : viewMode === "table" ? (
              <ResultTable
                results={filteredListings.map(toUnifiedResult)}
                importingKey={null}
                onSelect={(result) => {
                  if (result.localId) {
                    const surface = document.querySelector<HTMLElement>(".realtyz-main-surface");
                    sessionStorage.setItem(AFFILIATE_SCROLL_KEY, String(surface?.scrollTop ?? window.scrollY));
                    navigate(`/properties/${result.localId}`, {
                      state: { propertySnapshot: result, returnTo: "/affiliate-network" },
                    });
                  }
                }}
                publishedLabel="פורסם לרשת"
                publishedAt={(result) =>
                  filteredListings.find((item) => item.id === result.localId)?.affiliate_approved_at ?? null
                }
                affiliateSortValue={(result) =>
                  filteredListings.find((item) => item.id === result.localId)?.affiliate_enabled ? 1 : 0
                }
                commissionSortValue={(result) => {
                  const listing = filteredListings.find((item) => item.id === result.localId);
                  if (!listing) return 0;
                  return (
                    Number(listing.affiliate_tier1_amount ?? 0) +
                    Number(listing.affiliate_tier2_amount ?? 0) +
                    (listing.affiliate_tier3_type === "fixed" ? Number(listing.affiliate_tier3_amount ?? 0) : 0)
                  );
                }}
                onCampaign={(result) => {
                  if (result.localId)
                    navigate(
                      `/campaigns?tab=create&channel=facebook&properties=${result.localId}&listing=${result.localId}`,
                      { state: returnState() },
                    );
                }}
                onEdit={(result) => {
                  if (result.localId)
                    navigate(`/properties/${result.localId}`, {
                      state: { returnTo: "/affiliate-network", openEdit: true },
                    });
                }}
                selectionMode={multiSelectMode}
                selectedIds={selectedListingIds}
                onToggleSelected={toggleSelectedListing}
                onDelete={(result) => result.localId && setDeleteTargetIds([result.localId])}
                // First column: shared properties are green; clicking always
                // opens the commissions dialog with the sharing switch.
                affiliateCell={(result) => {
                  const listing = filteredListings.find((item) => item.id === result.localId);
                  if (!listing) return null;
                  const shared = Boolean(listing.affiliate_enabled);
                  return (
                    <div className="inline-flex items-center gap-1">
                      <Button
                        size="icon"
                        variant={shared ? "default" : "outline"}
                        className={`h-8 w-8 ${shared ? "bg-success text-success-foreground hover:bg-success/90" : ""}`}
                        title={shared ? "עריכת עמלות והפסקת שיווק שותפים" : "פתיחת הנכס לשיווק שותפים"}
                        aria-label={shared ? "עריכת עמלות" : "פתיחת הנכס לשיווק שותפים"}
                        onClick={() => setEditing(listing)}
                      >
                        <Handshake className="h-4 w-4" />
                      </Button>
                      {shared ? (
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="פתיחת עמוד הנכס"
                          aria-label="פתיחת עמוד הנכס"
                        >
                          <a
                            href={publicUrl(`/p/${listing.id}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <SquareArrowOutUpLeft className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  );
                }}
                // Dedicated "עמלות" column: amounts per affiliate level.
                commissionCell={(result) => {
                  const listing = filteredListings.find((item) => item.id === result.localId);
                  if (!listing || !listing.affiliate_enabled) return null;
                  const tierTexts: Array<{
                    value: string;
                    label: string;
                    Icon: React.ComponentType<{ className?: string }>;
                  }> = [];
                  const money = (n: number) => `₪${Number(n).toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
                  const options =
                    listing.contact_options && typeof listing.contact_options === "object"
                      ? listing.contact_options
                      : {};
                  const chatQuestions = Array.isArray(options.questions) ? options.questions : [];
                  const phoneQuestions = Array.isArray(options.questions_phone)
                    ? options.questions_phone
                    : chatQuestions;
                  const t1 = Number(listing.affiliate_tier1_amount ?? 0);
                  const t2 = leadCost(Number(listing.affiliate_tier2_amount ?? 0), chatQuestions);
                  const t3 = leadCost(Number(listing.affiliate_tier3_amount ?? 0), phoneQuestions);
                  const t4 = Number(listing.affiliate_tier4_amount ?? 0);
                  const t4Type = (listing.affiliate_tier4_type ?? "fixed") as RewardType;
                  if (t1) tierTexts.push({ value: money(t1), label: "שם וטלפון", Icon: ClipboardList });
                  if (Number(listing.affiliate_tier2_amount ?? 0))
                    tierTexts.push({ value: money(t2), label: "סינון ב-WhatsApp", Icon: WhatsAppIcon });
                  if (Number(listing.affiliate_tier3_amount ?? 0))
                    tierTexts.push({ value: money(t3), label: "שיחת טלפון", Icon: Phone });
                  if (t4)
                    tierTexts.push({
                      value: t4Type === "percent" ? `${t4}%` : money(t4),
                      label: "סגירת עסקה · בעלי רישיון תיווך בלבד",
                      Icon: Trophy,
                    });
                  if (!tierTexts.length) return null;
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      title="עריכת מחירי העמלות וההגדרות"
                      aria-label="עריכת מחירי העמלות וההגדרות"
                      className="grid h-auto grid-cols-2 gap-x-3 gap-y-1 rounded-md px-1 py-0.5 text-[11px] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(listing);
                      }}
                    >
                      {tierTexts.map(({ value, label, Icon }) => (
                        <div key={label} className="flex items-center justify-start gap-1" title={label}>
                          <Icon className="h-3 w-3" />
                          <bdi dir="ltr">{value}</bdi>
                        </div>
                      ))}
                    </Button>
                  );
                }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredListings.map((l) => (
                  <Card
                    key={l.id}
                    className="group relative cursor-pointer overflow-hidden border-slate-200 transition-shadow hover:shadow-lg"
                    onClick={() => {
                      if (multiSelectMode) {
                        toggleSelectedListing(l.id);
                        return;
                      }
                      navigate(`/properties/${l.id}`, {
                        state: { propertySnapshot: toUnifiedResult(l), returnTo: "/affiliate-network" },
                      });
                    }}
                  >
                    {multiSelectMode ? (
                      <div className="absolute end-3 top-3 z-20" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedListingIds.has(l.id)}
                          onCheckedChange={() => toggleSelectedListing(l.id)}
                          aria-label="בחירת נכס"
                          className="h-5 w-5 bg-background"
                        />
                      </div>
                    ) : null}
                    <div className="border-b px-4 pb-2 pt-3">
                      <h3 className="truncate text-base font-semibold" title={l.property_title || undefined}>
                        {l.property_title || "נכס ללא כותרת"}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-normal">{propertyFullAddress(l)}</span>
                      </p>
                    </div>
                    <div data-property-image-toolbar className="flex min-h-10 items-center justify-end px-3"><PropertyReferralButton listingId={l.id} /></div>
                    <div className="aspect-[16/10] overflow-hidden bg-muted">
                      {listingPhotos(l)[0] ? (
                        <img
                          src={listingPhotos(l)[0]}
                          alt={propertyFullAddress(l)}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          אין תמונה
                        </div>
                      )}
                    </div>
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {l.rooms ? (
                          <span className="inline-flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5" />
                            {l.rooms} חד׳
                          </span>
                        ) : null}
                        {l.sqm ? (
                          <span className="inline-flex items-center gap-1">
                            <Ruler className="h-3.5 w-3.5" />
                            {l.sqm} מ״ר
                          </span>
                        ) : null}
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
                          <Label htmlFor={`affiliate-${l.id}`} className="text-xs text-muted-foreground">
                            שיתוף שותפים
                          </Label>
                          <Switch
                            id={`affiliate-${l.id}`}
                            checked={l.affiliate_enabled}
                            disabled={quickSave.isPending}
                            onCheckedChange={(enabled) =>
                              quickSave.mutate(
                                {
                                  listingId: l.id,
                                  enabled,
                                  rewardType: l.affiliate_reward_type ?? "fixed",
                                  rewardAmount: Number(l.affiliate_reward_amount ?? 0),
                                  tier1Amount: Number(l.affiliate_tier1_amount ?? 0),
                                  tier2Amount: Number(l.affiliate_tier2_amount ?? 0),
                                  tier3Type: l.affiliate_tier3_type ?? "fixed",
                                  tier3Amount: Number(l.affiliate_tier3_amount ?? 0),
                                },
                                { onError: () => toast.error("העדכון נכשל") },
                              )
                            }
                          />
                        </div>
                        {!multiSelectMode ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTargetIds([l.id]);
                            }}
                            title="מחיקת נכס"
                            aria-label="מחיקת נכס"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing(l);
                          }}
                        >
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
            <div className="flex h-10 max-w-sm items-center gap-2 rounded-md border border-input bg-background px-3">
              <Search className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם, טלפון או שותף"
                value={submissionsSearch}
                onChange={(e) => setSubmissionsSearch(e.target.value)}
                className="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {subsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : filteredSubmissions.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  שותפים עוד לא הגישו לידים לנכסים שלכם.
                </CardContent>
              </Card>
            ) : (
              filteredSubmissions.map((s) => (
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
                          <ContactAvatar
                            name={s.lead?.full_name || s.lead_name}
                            imageUrl={s.lead?.profile_picture_url}
                            className="h-8 w-8"
                          />
                          <span className="truncate">{s.lead?.full_name || s.lead_name}</span>
                          {s.lead_phone ? (
                            <>
                              {" "}
                              ·{" "}
                              <bdi dir="ltr" className="font-normal text-slate-500">
                                {s.lead_phone}
                              </bdi>
                            </>
                          ) : null}
                        </Button>
                        <div className="truncate text-[11px] text-slate-500">
                          {s.listing?.property_title || "נכס"} · שותף: {s.affiliate?.display_name || "שותף ללא שם"}
                          {" · "}
                          {new Date(s.created_at).toLocaleDateString("he-IL")}
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
                        tier3: Number(s.tier3_amount),
                        tier4Type: s.tier4_type ?? "fixed",
                        tier4: Number(s.tier4_amount ?? 0),
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
                              onSuccess: () => toast.success("הסטטוס עודכן"),
                              onError: () => toast.error("העדכון נכשל"),
                            },
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px] text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBMISSION_STATUS_ORDER.map((st) => (
                            <SelectItem key={st} value={st}>
                              {SUBMISSION_STATUS_LABELS[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={s.settlement_status}
                        onValueChange={(v) =>
                          updateSubmission.mutate(
                            { row: s, settlementStatus: v as SettlementStatus },
                            {
                              onSuccess: () => toast.success("ההסדרה עודכנה"),
                              onError: () => toast.error("העדכון נכשל"),
                            },
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px] text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SETTLEMENT_LABELS) as SettlementStatus[]).map((st) => (
                            <SelectItem key={st} value={st}>
                              {SETTLEMENT_LABELS[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="tracking" className="space-y-4 pt-4">
            <div className="flex max-w-sm items-center gap-3">
              <Checkbox
                checked={multiSelectMode}
                onCheckedChange={(checked) => {
                  setMultiSelectMode(Boolean(checked));
                  if (!checked) setSelectedListingIds(new Set());
                }}
                aria-label="בחירה מרובה"
                title="בחירה מרובה"
                className="h-5 w-5 shrink-0"
              />
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3">
                <Search className="pointer-events-none h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  placeholder="חיפוש נכס בשיווק או שותף"
                  value={trackingSearch}
                  onChange={(e) => setTrackingSearch(e.target.value)}
                  className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
            {refsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filteredReferrals.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא נכנסו לידים דרך שותפים.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {filteredReferrals.map((r) => (
                  <Card key={r.id} className="border-slate-200">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        {r.listing ? <PropertyThumb p={r.listing} size={52} /> : null}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">
                            {r.listing?.property_title || "נכס לא ידוע"}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            שותף: {r.affiliate?.display_name || "שותף ללא שם"}
                            {" · "}
                            {r.clicks} כניסות
                            {" · "}
                            {submissions.filter((sub: any) => sub.referral_id === r.id).length} לידים
                          </div>
                        </div>

                        {(() => {
                          const pub = r.listing?.id ? referralPublishers?.get(r.listing.id) : undefined;
                          if (!pub) return null;
                          return (
                            <span className="inline-flex max-w-[11rem] items-center gap-1.5">
                              {pub.logo ? (
                                <img src={pub.logo} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-md border border-border/60 bg-background object-contain" />
                              ) : (
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{pub.name.slice(0, 1)}</span>
                              )}
                              <span className="flex min-w-0 flex-col leading-tight">
                                <span className="truncate text-xs" title={pub.name}>{pub.name}</span>
                                {pub.userName && pub.userName !== pub.name ? <span className="truncate text-[11px] text-muted-foreground">{pub.userName}</span> : null}
                              </span>
                            </span>
                          );
                        })()}
                        <div className="text-sm font-bold text-emerald-700">
                          {formatReward(r.reward_type, r.reward_amount)}
                        </div>
                        {r.listing?.id ? (
                          <PropertyShareMenu results={[toUnifiedResult(r.listing as any)]} iconOnly variant="ghost" />
                        ) : null}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="הסרה מהשיווק"
                          aria-label="הסרה מהשיווק"
                          onClick={async () => {
                            if (!window.confirm("להסיר את הנכס מהשיווק של השותף?")) return;
                            const { error } = await supabase.from("affiliate_referrals").delete().eq("id", r.id);
                            if (error) { toast.error(error.message); return; }
                            toast.success("הנכס הוסר מהשיווק");
                            queryClient.invalidateQueries();
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>

                      {r.lead && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => openLead(r.lead?.id ?? "")}
                          className="h-auto w-full justify-start gap-2 bg-slate-50 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                        >
                          <ContactAvatar
                            name={r.lead.full_name}
                            imageUrl={r.lead.profile_picture_url}
                            className="h-8 w-8"
                          />
                          <span>{r.lead.full_name || "ליד"}</span>
                          {r.lead.phone ? (
                            <bdi dir="ltr" className="text-slate-500">
                              {r.lead.phone}
                            </bdi>
                          ) : null}
                        </Button>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={r.status}
                          onValueChange={(v) =>
                            updateReferral.mutate(
                              { id: r.id, status: v as ReferralStatus },
                              {
                                onSuccess: () => toast.success("הסטטוס עודכן"),
                                onError: () => toast.error("העדכון נכשל"),
                              },
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[170px] text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REFERRAL_STATUS_ORDER.map((s) => (
                              <SelectItem key={s} value={s}>
                                {REFERRAL_STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={r.settlement_status}
                          onValueChange={(v) =>
                            updateReferral.mutate(
                              { id: r.id, settlementStatus: v as SettlementStatus },
                              {
                                onSuccess: () => toast.success("מצב ההסדרה עודכן"),
                                onError: () => toast.error("העדכון נכשל"),
                              },
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[160px] text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(SETTLEMENT_LABELS) as SettlementStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>
                                {SETTLEMENT_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <span className="text-[11px] text-slate-400">
                          נפתח {new Date(r.created_at).toLocaleDateString("he-IL")}
                          {r.settled_at ? ` · שולם ${new Date(r.settled_at).toLocaleDateString("he-IL")}` : ""}
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
      <PropertyDeleteDialog
        count={deleteTargetIds.length}
        open={deleteTargetIds.length > 0}
        deleting={deleteListings.isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetIds([]);
        }}
        onConfirm={confirmDeleteListings}
      />
    </>
  );
}

export default function AffiliateNetwork() {
  const { isAffiliateOnly } = useUserRole();
  const { isPartnerMode } = useAppMode();
  return <><PartnerPageIntroduction />{isAffiliateOnly || isPartnerMode ? <AffiliatePortal /> : <BrokerAffiliateNetwork />}</>;
}
