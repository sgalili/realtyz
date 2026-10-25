import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
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
    return <div className="space-y-3 text-base">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {guestRows.map((row) => <button key={row.key} type="button" onClick={join} className="group rounded-2xl border bg-gradient-to-br from-card to-muted/60 p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="flex items-center gap-2 font-bold text-foreground"><row.Icon className={`h-5 w-5 shrink-0 ${row.tone}`} />{row.label}</span>
          <span className="mt-1 flex items-center gap-2"><bdi dir="ltr" aria-hidden className={`select-none text-2xl font-extrabold opacity-60 blur-sm ${row.tone}`}>{row.fake}</bdi><Lock className="h-4 w-4 text-muted-foreground" /></span>
          {row.key !== 'closing' && <span className="block text-sm text-muted-foreground">מקס׳ ב־24 שעות: <strong className="text-foreground">{row.limit ?? 'ללא מגבלה'}</strong></span>}
        </button>)}
      </div>
      <Button type="button" size="lg" onClick={join} className="h-14 w-full gap-2 rounded-2xl text-lg font-bold shadow-lg"><Sparkles className="h-5 w-5" />הצטרפו לצפייה במחירי הלידים</Button>
    </div>;
  }
  return <div className="space-y-4 text-sm">
    {rows.map((row) => <section key={row.label} className="space-y-2 border-b pb-3">
      <div className="flex justify-between gap-3"><h3 className="font-semibold">{row.label}</h3>{user && <bdi dir="ltr" className={`font-bold ${row.key === 'form' ? 'text-lead-form' : row.key === 'whatsapp' ? 'text-lead-whatsapp' : 'text-lead-phone'}`}>{row.label === 'ליד מסונן בשיחת טלפון' && listing.tier3_type === 'percent' ? `${gross ? row.amount : partnerNetReward(row.amount)}%` : `${fmtILS(gross ? row.amount : partnerNetReward(row.amount))}`}</bdi>}</div>
      <div className="flex justify-between gap-3"><span className="text-muted-foreground">מקס׳ ב־24 שעות</span><strong>{options.lead_daily_limits?.[row.key] ?? 'ללא מגבלה'}</strong></div>
      {row.key === 'form' && options.form_fields?.map((field) => <p key={field.id}>{field.label} · {FORM_FIELD_TYPE_LABELS[field.type]} · {field.required ? 'חובה' : 'רשות'}{field.options?.length ? ` · ${field.options.join(', ')}` : ''}</p>)}
      {row.questions.length ? <><h4 className="text-muted-foreground">שאלות הסינון של המפרסם</h4><ol className="list-inside list-decimal space-y-1">{row.questions.map((q, i) => <li key={`${i}:${q}`}>{q}</li>)}</ol></> : row.key !== 'form' ? <p className="text-muted-foreground">לא הוגדרו שאלות סינון</p> : null}
    </section>)}
    {user && level4Unlocked && Number(listing.tier4_amount) > 0 ? <section className="space-y-2"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-1.5 font-semibold">סגירת עסקה · נטו לשותף *<BrokerClosingInfo /></h3><bdi dir="ltr" className="font-bold text-success">{listing.tier4_type === 'percent' ? `${partnerNetReward(Number(listing.tier4_amount))}%` : `${fmtILS(partnerNetReward(Number(listing.tier4_amount)))}`}</bdi></div><ClosingSplitNote gross={Number(listing.tier4_amount)} valueType={listing.tier4_type === 'percent' ? 'percent' : 'fixed'} /></section> : rewardTypes?.closing && <section className="space-y-2"><h3 className="font-semibold">סגירת עסקה</h3><p className="text-muted-foreground">תגמול לאחר סגירת העסקה. פרטי העמלה זמינים למתווכים בעלי רישיון מאומת בלבד.</p></section>}
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
      <DialogContent dir="rtl" className={`overflow-y-auto overscroll-contain ${user ? 'max-h-[85vh] ' : ''}${user ? 'sm:max-w-xl' : 'inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none bg-gradient-to-b from-primary/10 via-background to-background sm:max-w-none !w-full'}`}>
        <div className={user ? 'contents' : 'mx-auto flex w-full max-w-2xl flex-col gap-4 py-6'}><DialogHeader><DialogTitle className={user ? undefined : 'text-xl font-extrabold'}>תמחור לידים · {listing.property_title || 'נכס'}</DialogTitle><DialogDescription>{user ? 'סוגי הלידים והתגמולים לשותף' : 'הצטרפו כשותפים ותרוויחו על כל ליד'}</DialogDescription></DialogHeader>
        {query.isLoading ? <p role="status">טוען פרטי תמחור…</p> : query.isError ? <div role="alert" className="space-y-2"><p>לא ניתן לטעון את פרטי התמחור כרגע.</p><Button variant="outline" onClick={() => void query.refetch()}>ניסיון נוסף</Button></div> : query.data ? <>
          <LeadPricingInfo listing={listing} details={query.data.details} gross={gross} closingOnly={closingOnly} rewardTypes={rewardTypes} />
          {user && referralId && <section className="border-t pt-4"><LeftoverDiscountButton referralId={referralId} inline /></section>}
        </> : null}
        </div>
      </DialogContent>
    </Dialog>}
  </>;
}