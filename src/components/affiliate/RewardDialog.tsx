import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';
import { commissionEditScope } from '@/components/public/PropertyCommissionIcons';
import { listingToDraft } from '@/lib/adRecovery';
import type { PublicListingDraft } from '@/lib/publicListingDraft';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useUserRole } from '@/hooks/useUserRole';
import type { BrokerAffiliateListing } from '@/hooks/useAffiliate';

/**
 * Single-listing reward editing always opens the same Step 8 editor of the property publisher
 * ("תגמולים לפי סוג פנייה"), loaded from the authorized saved row. No separate legacy editor exists.
 */
export function RewardDialog({ listing, open, onOpenChange }: { listing: BrokerAffiliateListing | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { isSuperAdmin } = useUserRole();
  const [draft, setDraft] = useState<PublicListingDraft>();
  const [adminOnly, setAdminOnly] = useState(false);
  const id = listing?.id;
  useEffect(() => {
    if (!open || !id || !user || !activeWorkspaceId) { setDraft(undefined); return; }
    let live = true;
    void supabase.from('listings').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (!live) return;
      const scope = data ? commissionEditScope(data, user.id, activeWorkspaceId, isSuperAdmin) : 'none';
      if (error || !data || scope === 'none') { toast.error('אין הרשאה לערוך את התגמולים של הנכס'); onOpenChange(false); return; }
      setAdminOnly(scope === 'admin-only');
      setDraft({ ...listingToDraft(data), resumeStep: 8, files: [], savedAt: Date.now() });
    });
    return () => { live = false; };
  }, [open, id, user, activeWorkspaceId, isSuperAdmin, onOpenChange]);
  if (!open || !draft) return null;
  return <PublicListingPublisher key={id} pricingOnly adminOnlyEdit={adminOnly} resumeDraft={draft} onRecovered={() => { setDraft(undefined); onOpenChange(false); }} />;
}
