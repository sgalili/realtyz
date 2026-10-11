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
import { listingTiers, type BrokerAffiliateListing, type MarketplaceListing } from '@/hooks/useAffiliate';
import { FORM_FIELD_TYPE_LABELS, type LeadFormField } from '@/lib/leadTiers';
import { partnerNetReward } from '@/lib/affiliatePlans';

type PricingDetails = {
  daily_lead_cap?: number | null;
  contact_options?: { questions?: string[]; questions_phone?: string[]; form_fields?: LeadFormField[] };
};

export function LeadPricingInfo({ listing, details }: { listing: MarketplaceListing; details: PricingDetails }) {
  const options = details.contact_options ?? {};
  const rows = [
    { label: 'ליד דיגיטלי · שם וטלפון', amount: listing.tier1_amount, questions: [] },
    { label: 'ליד מסונן בווטסאפ', amount: listing.tier2_amount, questions: options.questions ?? [] },
    { label: 'ליד מסונן בשיחת טלפון', amount: listing.tier3_amount, questions: options.questions_phone ?? options.questions ?? [] },
  ].filter((row) => Number(row.amount) > 0);
  return <div className="space-y-4 text-sm">
    <div className="flex justify-between gap-3 border-b pb-3">
      <span className="text-muted-foreground">כמות לידים מרבית ביממה</span>
      <strong>{details.daily_lead_cap == null ? 'ללא מגבלה' : details.daily_lead_cap}</strong>
    </div>
    {rows.map((row) => <section key={row.label} className="space-y-2 border-b pb-3">
      <div className="flex justify-between gap-3"><h3 className="font-semibold">{row.label}</h3><bdi dir="ltr" className="font-bold text-success">₪{partnerNetReward(row.amount).toLocaleString('he-IL')}</bdi></div>
      {row.label.startsWith('ליד דיגיטלי') && options.form_fields?.map((field) => <p key={field.id}>{field.label} · {FORM_FIELD_TYPE_LABELS[field.type]} · {field.required ? 'חובה' : 'רשות'}{field.options?.length ? ` · ${field.options.join(', ')}` : ''}</p>)}
      {row.questions.length ? <><h4 className="text-muted-foreground">שאלות הסינון של המפרסם</h4><ol className="list-inside list-decimal space-y-1">{row.questions.map((q, i) => <li key={`${i}:${q}`}>{q}</li>)}</ol></> : !row.label.startsWith('ליד דיגיטלי') ? <p className="text-muted-foreground">לא הוגדרו שאלות סינון</p> : null}
    </section>)}
    {!rows.length && <p className="text-muted-foreground">לא הוגדר תמחור לידים</p>}
  </div>;
}

export default function LeadPricingDialog({ listing, referralId }: { listing: MarketplaceListing; referralId?: string | null }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const workspaceId = useActiveWorkspaceOwnerId();
  const query = useQuery({
    queryKey: ['affiliate-lead-pricing', listing.listing_id, user?.id, workspaceId],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      // Only the active workspace may supply an editable row; public info uses
      // the existing redacted public endpoint, never another owner's inventory.
      if (user && workspaceId && listing.broker_id === workspaceId) {
        const { data, error } = await supabase.from('listings').select('*').eq('id', listing.listing_id).eq('workspace_owner_id', workspaceId).maybeSingle();
        if (!error && data?.user_id === user.id) return { editable: data as unknown as BrokerAffiliateListing, details: data as unknown as PricingDetails };
      }
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listing.listing_id)}`, { method: 'GET' });
      if (error || !data?.property) throw new Error('Pricing unavailable');
      return { editable: null, details: data.property as PricingDetails };
    },
  });
  return <>
    <Button variant="ghost" className="h-auto justify-start px-1 py-1" aria-label="תמחור לידים" title="תמחור לידים" onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
      <CommissionTierBadges tiers={listingTiers(listing)} compact />
    </Button>
    {query.data?.editable && open ? <RewardDialog listing={query.data.editable} open={open} onOpenChange={setOpen} /> : <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>תמחור לידים · {listing.property_title || 'נכס'}</DialogTitle><DialogDescription>סוגי הלידים והתגמולים לשותף</DialogDescription></DialogHeader>
        {query.isLoading ? <p role="status">טוען פרטי תמחור…</p> : query.isError ? <div role="alert" className="space-y-2"><p>לא ניתן לטעון את פרטי התמחור כרגע.</p><Button variant="outline" onClick={() => void query.refetch()}>ניסיון נוסף</Button></div> : query.data ? <>
          <LeadPricingInfo listing={listing} details={query.data.details} />
          {referralId && <section className="border-t pt-4"><LeftoverDiscountButton referralId={referralId} inline /></section>}
        </> : null}
      </DialogContent>
    </Dialog>}
  </>;
}