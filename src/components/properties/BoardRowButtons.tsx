// Standalone board-row actions extracted from the share menu.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppMode } from '@/hooks/useAppMode';
import { useUserRole } from '@/hooks/useUserRole';
import { mintShareUrlForResult, prepareCampaignListingIds } from '@/lib/propertyShare';
import type { UnifiedResult } from '@/lib/propertySearch';

export function BoardPublishButton({ result }: { result: UnifiedResult }) {
  const navigate = useNavigate();
  const { isPartnerMode } = useAppMode();
  const { isAffiliateOnly } = useUserRole();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const ids = await prepareCampaignListingIds([result]);
      const params = new URLSearchParams({ tab: 'create', channel: 'facebook', properties: ids.join(','), listing: ids[0], fresh: '1' });
      navigate(`${isPartnerMode || isAffiliateOnly ? '/posts' : '/campaigns'}?${params.toString()}`);
    } catch (e: any) { toast.error(e?.message ?? 'הכנת הנכס לפרסום ברשתות נכשלה'); }
    finally { setBusy(false); }
  };
  return (
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={busy} title="פרסם ברשתות" aria-label="פרסם ברשתות" onClick={(e) => { e.stopPropagation(); void run(); }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function BoardOpenPageButton({ result }: { result: UnifiedResult }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { window.open(await mintShareUrlForResult(result), '_blank', 'noopener,noreferrer'); }
    catch (e: any) { toast.error(e?.message ?? 'פתיחת דף הנכס נכשלה'); }
    finally { setBusy(false); }
  };
  return (
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={busy} title="פתח בעמוד חדש" aria-label="פתח בעמוד חדש" onClick={(e) => { e.stopPropagation(); void run(); }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
    </Button>
  );
}
