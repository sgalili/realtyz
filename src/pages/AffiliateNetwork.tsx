// Broker-side Affiliate Network management.
//
// Tab 1 "נכסים ותגמולים" — flip a property into the affiliate marketplace and
//   set the reward (fixed ILS or percent of commission) paid on a signed deal.
// Tab 2 "מתעניינים משותפים" — full tracking CRM of every affiliate-generated
//   referral: status funnel, source affiliate, linked lead, and settlement.
import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Banknote, Building2, Handshake, MapPin, Percent, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
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
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Sync form state to the listing being edited (render-time, no effect needed).
  if (listing && hydratedFor !== listing.id) {
    setHydratedFor(listing.id);
    setEnabled(listing.affiliate_enabled);
    setRewardType(listing.affiliate_reward_type ?? 'fixed');
    setAmount(String(listing.affiliate_reward_amount ?? 0));
  }

  if (!listing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
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

          <div className="space-y-2">
            <Label>סוג התגמול</Label>
            <Select value={rewardType} onValueChange={(v) => setRewardType(v as RewardType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">סכום קבוע (₪)</SelectItem>
                <SelectItem value="percent">אחוז מהעמלה (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{rewardType === 'fixed' ? 'סכום התגמול בשקלים' : 'אחוז מהעמלה'}</Label>
            <div className="relative">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                className="pe-9"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400">
                {rewardType === 'fixed' ? '₪' : <Percent className="h-4 w-4" />}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              התגמול משולם על עסקה שנחתמת דרך השותף. שינוי התגמול לא משפיע על שיווקים קיימים.
            </p>
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

export default function AffiliateNetwork() {
  const { data: listings = [], isLoading: listingsLoading } = useBrokerAffiliateListings();
  const { data: referrals = [], isLoading: refsLoading } = useBrokerReferrals();
  const updateReferral = useUpdateReferral();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<BrokerAffiliateListing | null>(null);

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
    <AppLayout>
      <div className="space-y-5 p-4" dir="rtl">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">רשת השותפים</h1>
          <p className="text-sm text-slate-500">
            קבעו תגמול לכל נכס, ועקבו אחרי כל מתעניין שמגיע דרך שותפי השיווק.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'נכסים פתוחים לשותפים', value: String(totals.active), icon: Building2, color: 'text-sky-600' },
            { label: 'שיווקים פעילים', value: String(totals.referrals), icon: Users, color: 'text-indigo-600' },
            { label: 'עסקאות דרך שותפים', value: String(totals.signed), icon: Handshake, color: 'text-emerald-600' },
            { label: 'תגמול לתשלום', value: fmtILS(totals.owed), icon: Banknote, color: 'text-amber-600' },
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

        <Tabs defaultValue="rewards">
          <TabsList>
            <TabsTrigger value="rewards">נכסים ותגמולים</TabsTrigger>
            <TabsTrigger value="tracking">מתעניינים משותפים</TabsTrigger>
          </TabsList>

          <TabsContent value="rewards" className="space-y-4 pt-4">
            <div className="relative max-w-sm">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="חיפוש נכס"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pe-9"
              />
            </div>

            {listingsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filteredListings.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  לא נמצאו נכסים בחשבון זה.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {filteredListings.map((l) => (
                  <Card key={l.id} className="border-slate-200">
                    <CardContent className="flex flex-wrap items-center gap-3 p-3.5">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                        {l.image_url ? (
                          <img src={l.image_url} alt={l.property_title ?? 'נכס'} loading="lazy" className="h-12 w-12 object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center">
                            <Building2 className="h-5 w-5 text-slate-300" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900">
                          {l.property_title || 'נכס ללא כותרת'}
                        </div>
                        <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[l.address, l.city].filter(Boolean).join(', ') || 'כתובת לא צוינה'}
                        </div>
                      </div>

                      {l.asking_price ? (
                        <Badge variant="outline" className="text-[11px]">
                          <bdi dir="ltr">{fmtILS(l.asking_price)}</bdi>
                        </Badge>
                      ) : null}

                      {l.affiliate_enabled ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          {formatReward(l.affiliate_reward_type, l.affiliate_reward_amount)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-slate-500">סגור לשותפים</Badge>
                      )}

                      <Button size="sm" variant="outline" onClick={() => setEditing(l)}>
                        קביעת תגמול
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tracking" className="pt-4">
            {refsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : referrals.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא נכנסו מתעניינים דרך שותפים.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {referrals.map((r) => (
                  <Card key={r.id} className="border-slate-200">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">
                            {r.listing?.property_title || 'נכס לא ידוע'}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            שותף: {r.affiliate?.display_name || 'שותף ללא שם'}
                            {r.affiliate?.phone ? ` · ${r.affiliate.phone}` : ''}
                            {' · '}
                            <bdi dir="ltr">{r.tracking_code}</bdi>
                            {' · '}
                            {r.clicks} כניסות
                          </div>
                        </div>

                        <div className="text-sm font-bold text-emerald-700">
                          {formatReward(r.reward_type, r.reward_amount)}
                        </div>
                      </div>

                      {r.lead && (
                        <Link
                          to={`/lead-crm/${r.lead.id}`}
                          className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
                        >
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          {r.lead.full_name || 'מתעניין'}
                          {r.lead.phone ? <bdi dir="ltr" className="text-slate-500">{r.lead.phone}</bdi> : null}
                        </Link>
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
    </AppLayout>
  );
}
