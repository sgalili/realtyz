import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CommissionTierBadges from './CommissionTierBadges';
import LeftoverDiscountButton from './LeftoverDiscountButton';
import { RewardDialog } from './RewardDialog';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { type BrokerAffiliateListing, type MarketplaceListing } from '@/hooks/useAffiliate';
import { cleanFormFields, FORM_FIELD_TYPE_LABELS, type LeadFormField } from '@/lib/leadTiers';
import { fmtILS } from '@/lib/formatCurrency';
import { closingFeeAmount } from '@/lib/closingFee';
import { partnerNetReward } from '@/lib/affiliatePlans';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList, Phone, Trophy, Lock, Sparkles, ChevronDown } from 'lucide-react';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { ClosingSplitNote } from './ClosingSplitNote';
import { BrokerClosingInfo, ClosingLicenseInfo } from './BrokerClosingInfo';
import type { RewardTypes } from './CommissionTierBadges';
import { useUserRole } from '@/hooks/useUserRole';

const FORM_TIER_LABEL = 'שדות מטופס בעמוד נחיתה';

type PricingListing = Pick<MarketplaceListing, 'listing_id' | 'broker_id' | 'property_title' | 'tier1_amount' | 'tier2_amount' | 'tier3_amount' | 'tier4_amount' | 'tier4_type'> & { tier3_type?: string };

type PricingDetails = {
  daily_lead_cap?: number | null;
  asking_price?: number | null;
  deal_type?: string | null;
  contact_options?: { questions?: string[]; questions_phone?: string[]; form_fields?: LeadFormField[]; lead_daily_limits?: import('@/lib/closingFee').LeadDailyLimits };
};

export function LeadPricingInfo({ listing, details, gross = false, closingOnly = false, rewardTypes }: { listing: PricingListing; details: PricingDetails; gross?: boolean; closingOnly?: boolean; rewardTypes?: RewardTypes }) {
  const { user } = useAuth();
  const { level4Unlocked } = useAffiliateLicense();
  const { isSuperAdmin, roles } = useUserRole();
  const showAll = !user || isSuperAdmin || roles.some(role => ['managing_broker', 'lead_agent', 'agent'].includes(role));
  const knownZero = (key: keyof RewardTypes, amount: number) => rewardTypes?.[key] === false || (!rewardTypes && key !== 'closing' && amount === 0);
  const closingZero = rewardTypes?.closing === false || (!rewardTypes && level4Unlocked && Number(listing.tier4_amount) === 0);
  const options = details.contact_options ?? {};
  // A percentage closing fee is always a share of the property price, so the
  // partner's net share is also shown in shekels next to the percent.
  const closingBase = Math.max(0, Number(details.asking_price) || 0);
  const closingNetPercent = partnerNetReward(Number(listing.tier4_amount));
  const closingNetShekels = closingBase > 0 ? Math.round(closingFeeAmount(closingNetPercent, closingBase)) : 0;
  const rows = closingOnly ? [] : [
    { key: 'form' as const, label: FORM_TIER_LABEL, amount: listing.tier1_amount, questions: [] },
    { key: 'whatsapp' as const, label: 'ליד מסונן בווטסאפ', amount: listing.tier2_amount, questions: options.questions ?? [] },
    { key: 'phone' as const, label: 'ליד מסונן בשיחת טלפון', amount: listing.tier3_amount, questions: options.questions_phone ?? options.questions ?? [] },
  ].filter((row) => showAll || (rewardTypes ? rewardTypes[row.key] === true : Number(row.amount) > 0));
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) {
    const join = () => navigate('/auth', { state: { returnTo: location.pathname + location.search, tab: 'signup' } });
    // Placeholder figures only: real amounts are never sent to guests.
    const guestRows = [
      ...rows.map((row) => ({ ...row, Icon: row.key === 'form' ? ClipboardList : row.key === 'whatsapp' ? WhatsAppIcon : Phone, tone: row.key === 'form' ? 'text-lead-form' : row.key === 'whatsapp' ? 'text-lead-whatsapp' : 'text-lead-phone', fake: row.key === 'form' ? '₪85' : row.key === 'whatsapp' ? '₪240' : '₪380', limit: options.lead_daily_limits?.[row.key] })),
    ];
    return <div className="space-y-4 text-base">
      <div className="space-y-4">
        {guestRows.map((row) => <Card key={row.key} className="rounded-2xl p-4">
          <Button type="button" variant="ghost" onClick={join} className="h-auto w-full justify-start gap-3 whitespace-normal p-0 text-start hover:bg-transparent">
            <row.Icon className={`h-8 w-8 shrink-0 ${knownZero(row.key, row.amount) ? 'lead-no-fee' : row.tone}`} />
            <span className="min-w-0 flex-1 text-lg font-bold leading-snug">{row.label}</span>
            {knownZero(row.key, row.amount) ? <span className="lead-no-fee shrink-0 text-base">ללא עמלה</span> : <span className="flex shrink-0 items-center gap-1"><bdi dir="ltr" aria-hidden className={`select-none text-2xl font-extrabold opacity-60 blur-sm ${row.tone}`}>{row.fake}</bdi><Lock className="h-4 w-4 text-muted-foreground" /></span>}
          </Button>
          {<p className="mt-2 text-base text-muted-foreground">מקס׳ ב־24 שעות: <strong className="text-foreground">{row.limit ?? 'ללא מגבלה'}</strong></p>}
        </Card>)}
      </div>
      <Card className="space-y-3 rounded-2xl p-4"><div className="flex items-center gap-3 text-muted-foreground"><Trophy className="h-8 w-8 shrink-0" /><h3 className="flex-1 text-lg font-bold text-foreground">סגירת עסקה</h3><span className="text-base">למתווכים</span></div><ClosingLicenseInfo /></Card>
      <Button type="button" size="lg" onClick={join} className="h-14 w-full gap-2 rounded-2xl text-lg font-bold shadow-lg"><Sparkles className="h-5 w-5" />הצטרפו לצפייה במחירי הלידים</Button>
    </div>;
  }
  return <div className="space-y-4 text-base leading-relaxed">
    {rows.map((row) => <Card key={row.label} className="space-y-2 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex min-w-0 items-center gap-3 text-lg font-bold leading-snug">{row.key === 'form' ? <ClipboardList className={`h-8 w-8 shrink-0 ${knownZero(row.key, row.amount) ? 'lead-no-fee' : 'text-lead-form'}`} /> : row.key === 'whatsapp' ? <WhatsAppIcon className={`h-8 w-8 shrink-0 ${knownZero(row.key, row.amount) ? 'lead-no-fee' : 'text-lead-whatsapp'}`} /> : <Phone className={`h-8 w-8 shrink-0 ${knownZero(row.key, row.amount) ? 'lead-no-fee' : 'text-lead-phone'}`} />}{row.label}</h3>{knownZero(row.key, row.amount) ? <span className="lead-no-fee ms-auto text-base font-bold">ללא עמלה</span> : user && <bdi dir="ltr" className={`ms-auto shrink-0 text-2xl font-bold ${row.key === 'form' ? 'text-lead-form' : row.key === 'whatsapp' ? 'text-lead-whatsapp' : 'text-lead-phone'}`}>{row.label === 'ליד מסונן בשיחת טלפון' && listing.tier3_type === 'percent' ? `${gross ? row.amount : partnerNetReward(row.amount)}%` : `${fmtILS(gross ? row.amount : partnerNetReward(row.amount))}`}</bdi>}</div>
      <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">מקס׳ ב־24 שעות</span><strong>{options.lead_daily_limits?.[row.key] ?? 'ללא מגבלה'}</strong></div>
      {row.key === 'form' && <div className="space-y-1"><p>שם מלא · חובה</p><p>מספר טלפון · חובה</p>{cleanFormFields(options.form_fields).map((field) => <p key={field.id}>{field.label} · {FORM_FIELD_TYPE_LABELS[field.type]} · {field.required ? 'חובה' : 'רשות'}{field.options?.length ? ` · ${field.options.join(', ')}` : ''}</p>)}</div>}
      {row.questions.length ? <Collapsible><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="group h-auto w-full justify-between gap-2 whitespace-normal px-0 py-2 text-start text-base text-muted-foreground"><span>שאלות הסינון של המפרסם</span><ChevronDown className="h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger><CollapsibleContent><ol className="list-inside list-decimal space-y-1">{row.questions.map((q, i) => <li key={`${i}:${q}`}>{q}</li>)}</ol></CollapsibleContent></Collapsible> : row.key !== 'form' ? <p className="text-muted-foreground">לא הוגדרו שאלות סינון</p> : null}
    </Card>)}
    {user && level4Unlocked && Number(listing.tier4_amount) > 0 ? <Card className="space-y-2 rounded-2xl p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-lg font-bold"><Trophy className="h-8 w-8 shrink-0 text-lead-closing" />סגירת עסקה · נטו לשותף *<BrokerClosingInfo /></h3><bdi dir="ltr" className="ms-auto shrink-0 text-2xl font-bold text-lead-closing">{listing.tier4_type === 'percent' ? <>{`${closingNetPercent}%`}{closingNetShekels > 0 ? <span className="ms-1 text-base font-extrabold">({fmtILS(closingNetShekels)})</span> : null}</> : `${fmtILS(Math.round(partnerNetReward(Number(listing.tier4_amount))))}`}</bdi></div><ClosingSplitNote gross={Number(listing.tier4_amount)} valueType={listing.tier4_type === 'percent' ? 'percent' : 'fixed'} /></Card> : !level4Unlocked ? <Card className="space-y-3 rounded-2xl p-4"><div className="flex items-center gap-3 text-muted-foreground"><Trophy className="h-8 w-8 shrink-0" /><h3 className="flex-1 text-lg font-bold text-foreground">סגירת עסקה</h3><span className="text-base">למתווכים</span></div><ClosingLicenseInfo /></Card> : (showAll || rewardTypes?.closing || closingOnly) && <Card className="space-y-2 rounded-2xl p-4"><h3 className="flex items-center gap-3 text-lg font-bold"><Trophy className={`h-8 w-8 shrink-0 ${closingZero ? 'lead-no-fee' : 'text-lead-closing'}`} />סגירת עסקה{closingZero && <span className="lead-no-fee text-base">ללא עמלה</span>}</h3>{!closingZero && <p className="text-muted-foreground">תגמול לאחר סגירת העסקה. פרטי העמלה זמינים למתווכים בעלי רישיון מאומת בלבד.</p>}</Card>}
    {!rows.length && !closingOnly && !rewardTypes?.closing && <p className="text-muted-foreground">לא הוגדר תמחור לידים</p>}
  </div>;
}

export default function LeadPricingDialog({ listing, referralId, children, readOnly = false, compact = true, gross = false, closingOnly = false, rewardTypes }: { listing: PricingListing; referralId?: string | null; children?: ReactNode; readOnly?: boolean; compact?: boolean; gross?: boolean; closingOnly?: boolean; rewardTypes?: RewardTypes }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const workspaceId = useActiveWorkspaceOwnerId();
  const query = useQuery({
    queryKey: ['affiliate-lead-pricing', listing.listing_id, user?.id, workspaceId, readOnly],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      // Only the active workspace may supply an editable row; public info uses
      // the existing redacted public endpoint, never another owner's inventory.
      if (user && workspaceId && (listing.broker_id === workspaceId || gross)) {
        const { data, error } = await supabase.from('listings').select('*').eq('id', listing.listing_id).eq('workspace_owner_id', workspaceId).maybeSingle();
        if (!error && data && (readOnly || data.user_id === user.id)) return { editable: readOnly ? null : data as unknown as BrokerAffiliateListing, details: data as unknown as PricingDetails };
      }
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listing.listing_id)}`, { method: 'GET' });
      if (error || !data?.property) throw new Error('Pricing unavailable');
      return { editable: null, details: data.property as PricingDetails };
    },
  });
  return <>
    <Button variant="ghost" className="h-auto justify-start border-0 bg-transparent px-0 py-1 shadow-none hover:bg-transparent" aria-label="תמחור לידים" title="תגמולים" onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
      {children ?? <CommissionTierBadges tiers={{ tier1: listing.tier1_amount, tier2: listing.tier2_amount, tier3: listing.tier3_amount, tier4: Number(listing.tier4_amount ?? 0), tier4Type: listing.tier4_type ?? 'fixed' }} compact={compact} closingOnly={closingOnly} />}
    </Button>
    {query.data?.editable && open ? <RewardDialog listing={query.data.editable} open={open} onOpenChange={setOpen} /> : <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" onClick={event => event.stopPropagation()} className="mx-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl bg-muted p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4"><DialogHeader className="px-5"><DialogTitle className="text-xl font-extrabold leading-snug">תמחור לידים · {listing.property_title || 'נכס'}</DialogTitle><DialogDescription className="text-base">{user ? 'סוגי הלידים והתגמולים לשותף' : 'הצטרפו כשותפים ותרוויחו על כל ליד'}</DialogDescription></DialogHeader>
        {query.isLoading ? <p role="status">טוען פרטי תמחור…</p> : query.isError ? <div role="alert" className="space-y-2"><p>לא ניתן לטעון את פרטי התמחור כרגע.</p><Button variant="outline" onClick={() => void query.refetch()}>ניסיון נוסף</Button></div> : query.data ? <>
          <LeadPricingInfo listing={listing} details={query.data.details} gross={gross} closingOnly={closingOnly} rewardTypes={rewardTypes} />
          {user && referralId && <section className="border-t pt-4"><LeftoverDiscountButton referralId={referralId} inline /></section>}
        </> : null}
        </div>
      </DialogContent>
    </Dialog>}
  </>;
}