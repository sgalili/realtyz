// Affiliate Portal — the ONLY screen an affiliate-only account sees.
//
// Deliberately narrow: no CRM, no office settings, no broker tools. An affiliate
// browses broker-approved properties, sees exactly what they earn per closing,
// and generates a personal tracking link to market with.
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Banknote,
  Building2,
  Copy,
  Link2,
  MapPin,
  Megaphone,
  MousePointerClick,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';
import SubmitLeadDialog from '@/components/affiliate/SubmitLeadDialog';
import {
  REFERRAL_STATUS_LABELS,
  SETTLEMENT_LABELS,
  affiliateTrackingLink,
  formatReward,
  useAffiliateMarketplace,
  useMyReferrals,
  listingTiers,
  useMySubmissions,
  accruedEarnings,
  SUBMISSION_STATUS_LABELS,
  useRegisterAffiliate,
  useStartPromoting,
  type MarketplaceListing,
} from '@/hooks/useAffiliate';
import { useUserRole } from '@/hooks/useUserRole';
import { fmtILS } from '@/lib/formatCurrency';

const DEAL_TYPE_LABELS: Record<string, string> = {
  sale: 'למכירה',
  rent: 'להשכרה',
};

function firstPhoto(listing: MarketplaceListing): string | null {
  if (listing.image_url) return listing.image_url;
  const photos = listing.media_photos;
  if (Array.isArray(photos)) {
    const first = photos[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'url' in (first as Record<string, unknown>)) {
      return String((first as Record<string, unknown>).url);
    }
  }
  return null;
}

/** Self-signup card for a signed-in user who is not yet an affiliate. */
function JoinAffiliateCard() {
  const register = useRegisterAffiliate();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card className="border-slate-200">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 ring-1 ring-sky-200">
            <Sparkles className="h-6 w-6 text-sky-600" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">הרשמה לרשת השותפים</CardTitle>
          <p className="text-sm text-slate-500">
            שווקו נכסים של מתווכים מהרשת וקבלו תגמול על כל עסקה שנחתמת דרככם.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="שם לתצוגה"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            placeholder="טלפון ליצירת קשר"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
          <Button
            className="w-full"
            disabled={register.isPending}
            onClick={() =>
              register.mutate(
                { displayName: displayName.trim() || undefined, phone: phone.trim() || undefined },
                {
                  onSuccess: () => toast.success('נרשמתם לרשת השותפים'),
                  onError: () => toast.error('ההרשמה נכשלה, נסו שוב'),
                },
              )
            }
          >
            {register.isPending ? 'רושם...' : 'הצטרפות לרשת'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MarketplaceCard({ listing }: { listing: MarketplaceListing }) {
  const promote = useStartPromoting();
  const [link, setLink] = useState<string | null>(null);
  const photo = firstPhoto(listing);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200 transition-shadow hover:shadow-md">
      <div className="relative h-40 w-full bg-slate-100">
        {photo ? (
          <img src={photo} alt={listing.property_title ?? 'נכס'} loading="lazy" className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-40 w-full items-center justify-center">
            <Building2 className="h-8 w-8 text-slate-300" />
          </div>
        )}
        <div className="absolute end-2 top-2">
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
            {formatReward(listing.reward_type, listing.reward_amount)}
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-2 p-4">
        <div className="truncate text-sm font-bold text-slate-900">
          {listing.property_title || 'נכס ללא כותרת'}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {[listing.address, listing.city].filter(Boolean).join(', ') || 'כתובת לא צוינה'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {listing.deal_type && (
            <Badge variant="outline" className="text-[11px]">
              {DEAL_TYPE_LABELS[listing.deal_type] ?? listing.deal_type}
            </Badge>
          )}
          {listing.rooms ? (
            <Badge variant="outline" className="text-[11px]">{listing.rooms} חדרים</Badge>
          ) : null}
          {listing.asking_price ? (
            <Badge variant="outline" className="text-[11px]">
              <bdi dir="ltr">{fmtILS(listing.asking_price)}</bdi>
            </Badge>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500">פירוט העמלה ב-3 שלבים</div>
          <CommissionTierBadges tiers={listingTiers(listing)} />
        </div>

        <SubmitLeadDialog listing={listing} />

        {link ? (
          <div className="space-y-2">
            <div className="truncate rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
              <bdi dir="ltr">{link}</bdi>
            </div>
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => copy(link)}>
              <Copy className="h-3.5 w-3.5" />
              העתקת קישור השיווק
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={promote.isPending}
            onClick={() =>
              promote.mutate(
                { listing },
                {
                  onSuccess: (res) => {
                    setLink(res.link);
                    toast.success('קישור שיווק אישי נוצר');
                  },
                  onError: () => toast.error('יצירת הקישור נכשלה'),
                },
              )
            }
          >
            <Megaphone className="h-3.5 w-3.5" />
            {promote.isPending ? 'מכין קישור...' : 'קבלת קישור לשיווק'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function AffiliatePortal() {
  const { isAffiliate, loading: roleLoading } = useUserRole();
  const { data: marketplace = [], isLoading: marketLoading } = useAffiliateMarketplace();
  const { data: referrals = [], isLoading: refLoading } = useMyReferrals();
  const { data: submissions = [], isLoading: subsLoading } = useMySubmissions();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return marketplace;
    return marketplace.filter((l) =>
      [l.property_title, l.address, l.city].some((f) => (f ?? '').toLowerCase().includes(q)),
    );
  }, [marketplace, search]);

  const stats = useMemo(() => {
    const clicks = referrals.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
    const signed = referrals.filter((r) => r.status === 'deal_signed');
    const earned = signed
      .filter((r) => r.reward_type === 'fixed')
      .reduce((sum, r) => sum + Number(r.reward_amount ?? 0), 0);
    const submissionEarned = submissions.reduce((sum, s) => sum + accruedEarnings(s), 0);
    return {
      promoting: referrals.length,
      clicks,
      signed: signed.length + submissions.filter((s) => s.status === 'closed').length,
      earned: earned + submissionEarned,
      leads: submissions.length,
    };
  }, [referrals, submissions]);

  if (roleLoading) {
    return (
      <>
        <div className="space-y-4 p-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!isAffiliate) {
    return (
      <>
        <JoinAffiliateCard />
      </>
    );
  }

  return (
    <>
      <div className="space-y-5 p-4" dir="rtl">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">רשת השותפים</h1>
          <p className="text-sm text-slate-500">
            בחרו נכס, קבלו קישור שיווק אישי, וקבלו תגמול על כל עסקה שנסגרת דרככם.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'נכסים בשיווק', value: String(stats.promoting), icon: Megaphone, color: 'text-sky-600' },
            { label: 'אנשי קשר שהוגשו', value: String(stats.leads), icon: MousePointerClick, color: 'text-indigo-600' },
            { label: 'עסקאות שנחתמו', value: String(stats.signed), icon: TrendingUp, color: 'text-emerald-600' },
            { label: 'תגמול מצטבר', value: fmtILS(stats.earned), icon: Banknote, color: 'text-amber-600' },
          ].map((s) => (
            <Card key={s.label} className="border-slate-200">
              <CardContent className="flex items-center gap-3 p-3.5">
                <s.icon className={`h-5 w-5 shrink-0 ${s.color}`} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] text-slate-500">{s.label}</div>
                  <div className="text-base font-bold text-slate-900">
                    <bdi dir="ltr">{s.value}</bdi>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="marketplace">
          <TabsList>
            <TabsTrigger value="marketplace">נכסים לשיווק</TabsTrigger>
            <TabsTrigger value="leads">אנשי הקשר שהגשתי</TabsTrigger>
            <TabsTrigger value="mine">השיווקים שלי</TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="space-y-4 pt-4">
            <div className="relative max-w-sm">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="חיפוש לפי כותרת, כתובת או עיר"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pe-9"
              />
            </div>

            {marketLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  אין כרגע נכסים פתוחים לשיווק. מתווכים מוסיפים נכסים לרשת באופן שוטף.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((l) => <MarketplaceCard key={l.listing_id} listing={l} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="leads" className="space-y-3 pt-4">
            {subsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : submissions.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא הגשתם אנשי קשר. בחרו נכס ולחצו "הגשת איש קשר לנכס".
                </CardContent>
              </Card>
            ) : (
              submissions.map((s) => {
                const stage = s.status === 'closed' ? 3 : s.status === 'verified' ? 2 : s.status === 'rejected' ? 0 : 1;
                return (
                  <Card key={s.id} className="border-slate-200">
                    <CardContent className="space-y-2.5 p-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">{s.lead_name}</div>
                          <div className="truncate text-[11px] text-slate-500">
                            {s.listing?.property_title || 'נכס'}
                            {s.lead_phone ? <> · <bdi dir="ltr">{s.lead_phone}</bdi></> : null}
                            {' · '}
                            {new Date(s.created_at).toLocaleDateString('he-IL')}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[11px]">
                          {SUBMISSION_STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {SETTLEMENT_LABELS[s.settlement_status] ?? s.settlement_status}
                        </Badge>
                        <div className="text-sm font-bold text-emerald-700">
                          <bdi dir="ltr">{fmtILS(accruedEarnings(s))}</bdi>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3].map((n) => (
                          <div
                            key={n}
                            className={`h-1.5 flex-1 rounded-full ${stage >= n ? 'bg-emerald-500' : 'bg-slate-200'}`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>הוגש</span>
                        <span>אומת</span>
                        <span>נסגר</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>


          <TabsContent value="mine" className="pt-4">
            {refLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : referrals.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא התחלתם לשווק נכסים. עברו ללשונית "נכסים לשיווק".
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {referrals.map((r) => (
                  <Card key={r.id} className="border-slate-200">
                    <CardContent className="flex flex-wrap items-center gap-3 p-3.5">
                      <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          <bdi dir="ltr">{r.tracking_code}</bdi>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(r.created_at).toLocaleDateString('he-IL')} · {r.clicks} כניסות
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {REFERRAL_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {SETTLEMENT_LABELS[r.settlement_status] ?? r.settlement_status}
                      </Badge>
                      <div className="text-sm font-bold text-emerald-700">
                        {formatReward(r.reward_type, r.reward_amount)}
                      </div>
                      {r.listing_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              affiliateTrackingLink(null, r.listing_id!, r.tracking_code),
                            );
                            toast.success('הקישור הועתק');
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          העתקה
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
