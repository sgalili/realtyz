import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CommissionTierBadges from './CommissionTierBadges';
import LeftoverDiscountButton from './LeftoverDiscountButton';
import { RewardDialog } from './RewardDialog';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { type BrokerAffiliateListing, type MarketplaceListing } from '@/hooks/useAffiliate';
import { FORM_FIELD_TYPE_LABELS, type LeadFormField } from '@/lib/leadTiers';
import { fmtILS } from '@/lib/formatCurrency';
import { partnerNetReward } from '@/lib/affiliatePlans';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList, Phone, Trophy, Lock, Sparkles } from 'lucide-react';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { ClosingSplitNote } from './ClosingSplitNote';
import { BrokerClosingInfo } from './BrokerClosingInfo';
import type { RewardTypes } from './CommissionTierBadges';

const FORM_TIER_LABEL = 'שדות מטופס בעמוד נחיתה';

type PricingListing = Pick<MarketplaceListing, 'listing_id' | 'broker_id' | 'property_title' | 'tier1_amount' | 'tier2_amount' | 'tier3_amount' | 'tier4_amount' | 'tier4_type'> & { tier3_type?: string };

type PricingDetails = {
  daily_lead_cap?: number | null;
  contact_options?: { questions?: string[]; questions_phone?: string[]; form_fields?: LeadFormField[]; lead_daily_limits?: import('@/lib/closingFee').LeadDailyLimits };
};

export function LeadPricingInfo({ listing, details, gross = false, closingOnly = false, rewardTypes }: { listing: PricingListing; details: PricingDetails; gross?: boolean; closingOnly?: boolean; rewardTypes?: RewardTypes }) {
  const { user } = useAuth();
  const { level4Unlocked } = useAffiliateLicense();
  const options = details.contact_options ?? {};
  const rows = closingOnly ? [] : [
    { key: 'form' as const, label: FORM_TIER_LABEL, amount: listing.tier1_amount, questions: [] },
    { key: 'whatsapp' as const, label: 'ליד מסונן בווטסאפ', amount: listing.tier2_amount, questions: options.questions ?? [] },
    { key: 'phone' as const, label: 'ליד מסונן בשיחת טלפון', amount: listing.tier3_amount, questions: options.questions_phone ?? options.questions ?? [] },
  ].filter((row) => rewardTypes ? rewardTypes[row.key] === true : Number(row.amount) > 0);
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) {
    const join = () => navigate('/auth', { state: { returnTo: location.pathname + location.search, tab: 'signup' } });
    // Placeholder figures only: real amounts are never sent to guests.
    const guestRows = [
      ...rows.map((row) => ({ ...row, Icon: row.key === 'form' ? ClipboardList : row.key === 'whatsapp' ? WhatsAppIcon : Phone, tone: row.key === 'form' ? 'text-lead-form' : row.key === 'whatsapp' ? 'text-lead-whatsapp' : 'text-lead-phone', fake: row.key === 'form' ? '₪85' : row.key === 'whatsapp' ? '₪240' : '₪380', limit: options.lead_daily_limits?.[row.key] })),
      ...(rewardTypes?.closing || closingOnly ? [{ key: 'closing' as const, label: 'סגירת עסקה', Icon: Trophy, tone: 'text-lead-closing', fake: '₪4,500', limit: undefined, questions: [] as string[] }] : []),
    ];
    return <div className="space-y-4 text-base">
      <div className="space-y-4">
        {guestRows.map((row) => <Card key={row.key} className="rounded-2xl p-4">
          <Button type="button" variant="ghost" onClick={join} className="h-auto w-full justify-start gap-3 whitespace-normal p-0 text-start hover:bg-transparent">
            <row.Icon className={`h-8 w-8 shrink-0 ${row.tone}`} />
            <span className="min-w-0 flex-1 text-lg font-bold leading-snug">{row.label}</span>
            <span className="flex shrink-0 items-center gap-1"><bdi dir="ltr" aria-hidden className={`select-none text-2xl font-extrabold opacity-60 blur-sm ${row.tone}`}>{row.fake}</bdi><Lock className="h-4 w-4 text-muted-foreground" /></span>
          </Button>
          {row.key !== 'closing' && <p className="mt-2 text-base text-muted-foreground">מקס׳ ב־24 שעות: <strong className="text-foreground">{row.limit ?? 'ללא מגבלה'}</strong></p>}
        </Card>)}
      </div>
      <Button type="button" size="lg" onClick={join} className="h-14 w-full gap-2 rounded-2xl text-lg font-bold shadow-lg"><Sparkles className="h-5 w-5" />הצטרפו לצפייה במחירי הלידים</Button>
    </div>;
  }
  return <div className="space-y-4 text-base leading-relaxed">
    {rows.map((row) => <Card key={row.label} className="space-y-2 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex min-w-0 items-center gap-3 text-lg font-bold leading-snug">{row.key === 'form' ? <ClipboardList className="h-8 w-8 shrink-0 text-lead-form" /> : row.key === 'whatsapp' ? <WhatsAppIcon className="h-8 w-8 shrink-0 text-lead-whatsapp" /> : <Phone className="h-8 w-8 shrink-0 text-lead-phone" />}{row.label}</h3>{user && <bdi dir="ltr" className={`ms-auto shrink-0 text-2xl font-bold ${row.key === 'form' ? 'text-lead-form' : row.key === 'whatsapp' ? 'text-lead-whatsapp' : 'text-lead-phone'}`}>{row.label === 'ליד מסונן בשיחת טלפון' && listing.tier3_type === 'percent' ? `${gross ? row.amount : partnerNetReward(row.amount)}%` : `${fmtILS(gross ? row.amount : partnerNetReward(row.amount))}`}</bdi>}</div>
      <div className="flex justify-between gap-3"><span className="text-muted-foreground">מקס׳ ב־24 שעות</span><strong>{options.lead_daily_limits?.[row.key] ?? 'ללא מגבלה'}</strong></div>
      {row.key === 'form' && options.form_fields?.map((field) => <p key={field.id}>{field.label} · {FORM_FIELD_TYPE_LABELS[field.type]} · {field.required ? 'חובה' : 'רשות'}{field.options?.length ? ` · ${field.options.join(', ')}` : ''}</p>)}
      {row.questions.length ? <><h4 className="text-muted-foreground">שאלות הסינון של המפרסם</h4><ol className="list-inside list-decimal space-y-1">{row.questions.map((q, i) => <li key={`${i}:${q}`}>{q}</li>)}</ol></> : row.key !== 'form' ? <p className="text-muted-foreground">לא הוגדרו שאלות סינון</p> : null}
    </Card>)}
    {user && level4Unlocked && Number(listing.tier4_amount) > 0 ? <Card className="space-y-2 rounded-2xl p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-lg font-bold"><Trophy className="h-8 w-8 shrink-0 text-lead-closing" />סגירת עסקה · נטו לשותף *<BrokerClosingInfo /></h3><bdi dir="ltr" className="ms-auto shrink-0 text-2xl font-bold text-lead-closing">{listing.tier4_type === 'percent' ? `${partnerNetReward(Number(listing.tier4_amount))}%` : `${fmtILS(Math.round(partnerNetReward(Number(listing.tier4_amount))))}`}</bdi></div><ClosingSplitNote gross={Number(listing.tier4_amount)} valueType={listing.tier4_type === 'percent' ? 'percent' : 'fixed'} /></Card> : rewardTypes?.closing && <Card className="space-y-2 rounded-2xl p-4"><h3 className="flex items-center gap-3 text-lg font-bold"><Trophy className="h-8 w-8 shrink-0 text-lead-closing" />סגירת עסקה</h3><p className="text-muted-foreground">תגמול לאחר סגירת העסקה. פרטי העמלה זמינים למתווכים בעלי רישיון מאומת בלבד.</p></Card>}
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