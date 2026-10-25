import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useUserRole } from '@/hooks/useUserRole';
import PublicListingPublisher from './PublicListingPublisher';
import { listingToDraft } from '@/lib/adRecovery';
import type { PublicListingDraft } from '@/lib/publicListingDraft';
import { useAuth } from '@/hooks/useAuth';
import { useAffiliateMarketplace, listingTiers } from '@/hooks/useAffiliate';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import LeadPricingDialog from '@/components/affiliate/LeadPricingDialog';
import { RewardIcons, type RewardTypes } from '@/components/affiliate/CommissionTierBadges';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { tableRoyalties } from '@/lib/tableRoyalties';

export default function PropertyCommissionIcons({ listingId, raw, networkOpen, table = false }: { listingId: string; raw?: Record<string, unknown>; networkOpen?: boolean; table?: boolean }) {
  const { user } = useAuth();
  const { level4Unlocked } = useAffiliateLicense();
  const marketplace = useAffiliateMarketplace();
  const { activeWorkspaceId } = useWorkspace();
  const { isSuperAdmin } = useUserRole();
  const [draft, setDraft] = useState<PublicListingDraft>();
  const owned = useQuery({
    queryKey: ['owned-royalties', listingId, user?.id, activeWorkspaceId],
    enabled: table && !!user && !!activeWorkspaceId,
    queryFn: async () => {
      if (!user || !activeWorkspaceId) return null;
      const { data, error } = await supabase.from('listings').select('*').eq('id', listingId).eq('workspace_owner_id', activeWorkspaceId).maybeSingle();
      const own = data && (data.user_id === user.id || data.owner_id === user.id || data.workspace_owner_id === user.id);
      if (error || !data || !(own || isSuperAdmin)) return null;
      return { ...data, __adminOnly: !own };
    },
  });
  const { data: property } = useQuery({
    queryKey: ['public-commission-pricing', listingId, user?.id, level4Unlocked],
    enabled: networkOpen !== false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(listingId)}`, { method: 'GET' });
      if (error) throw error;
      return data?.property as Record<string, unknown> | undefined;
    },
  });
  if (networkOpen === false) return null;
  const source: Record<string, unknown> | undefined = owned.data ?? property ?? raw;
  const listing = marketplace.data?.find(row => row.listing_id === listingId);
  // Closing fee may live in the column or only in the wizard's deal_closing_commission; percent converts to ILS.
  const dcc = (source?.features as { deal_closing_commission?: { type?: string; value?: number } } | undefined)?.deal_closing_commission;
  const rawTier4 = Number(source?.affiliate_tier4_amount ?? 0) > 0 ? Number(source?.affiliate_tier4_amount) : Number(dcc?.value ?? 0);
  const rawType = Number(source?.affiliate_tier4_amount ?? 0) > 0 ? source?.affiliate_tier4_type : dcc?.type;
  const closingIls = rawType === 'percent' ? Math.round(Number(source?.asking_price ?? 0) * rawTier4 / 100) : rawTier4;
  const tiers = !property && listing ? listingTiers(listing) : {
    tier1: Number(source?.affiliate_tier1_amount ?? 0), tier2: Number(source?.affiliate_tier2_amount ?? 0),
    tier3: Number(source?.affiliate_tier3_amount ?? 0), tier4: level4Unlocked ? closingIls : 0,
    tier4Type: 'fixed' as 'percent' | 'fixed',
  };
  const types: RewardTypes = { ...(source?.reward_types as RewardTypes ?? { form: tiers.tier1 > 0, whatsapp: tiers.tier2 > 0, phone: tiers.tier3 > 0 }), closing: !!user && level4Unlocked && tiers.tier4 > 0 };
  const display = tableRoyalties(types, tiers, !!user, level4Unlocked);
  if (!Object.values(display.types).some(Boolean) && !owned.data) return null;
  const icons = <RewardIcons types={display.types} prices={display.prices} closingPercent={tiers.tier4Type === 'percent'} label={table ? null : 'תגמולים'} grid={table} closingLevel={typeof source?.closing_level === 'number' ? source.closing_level : null} levels={(source?.reward_levels ?? raw?.reward_levels) as never} />;
  if (table && owned.data) return <><Button variant="ghost" className="relative min-h-8 min-w-8 bg-transparent p-0 hover:bg-transparent" aria-label="עריכת תמלוגים" onClick={event => { event.stopPropagation(); if (owned.data) setDraft({ ...listingToDraft(owned.data), resumeStep: 8, files: [], savedAt: Date.now() }); }}>{owned.data.__adminOnly && <span title="ניתן לעריכה רק בזכות הרשאת מנהל-על" className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-destructive" />}{Object.values(display.types).some(Boolean) ? icons : (level4Unlocked ? <Trophy className="h-3.5 w-3.5 text-lead-closing" aria-label="סגירת עסקה" /> : <span className="text-xs font-semibold text-primary underline underline-offset-2">הגדרת תמלוגים</span>)}</Button>{draft && <PublicListingPublisher pricingOnly resumeDraft={draft} onRecovered={() => { setDraft(undefined); void owned.refetch(); }} />}</>;
  return <LeadPricingDialog readOnly rewardTypes={display.types} listing={{ listing_id: listingId, broker_id: '', property_title: null, tier1_amount: tiers.tier1, tier2_amount: tiers.tier2, tier3_amount: tiers.tier3, tier4_amount: tiers.tier4, tier4_type: tiers.tier4Type }}><RewardIcons types={display.types} prices={display.prices} closingPercent={tiers.tier4Type === 'percent'} label={table ? null : 'תגמולים'} grid={table} closingLevel={typeof source?.closing_level === 'number' ? source.closing_level : null} levels={(source?.reward_levels ?? raw?.reward_levels) as never} /></LeadPricingDialog>;
}
