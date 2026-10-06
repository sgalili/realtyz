// The /properties action bar (Yad2 ad, campaign, share, edit, delete, affiliate).
// Shared by the workspace table and the public board's owner-only expansion.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handshake, Loader2, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import { AffiliateCommissionButton } from '@/components/properties/AffiliateCommissionButton';
import { PropertyDeleteDialog } from '@/components/properties/PropertyDeleteDialog';
import { Yad2Icon } from '@/components/properties/Yad2Icon';
import { useYad2AdStatus } from '@/hooks/useYad2AdStatus';
import { useDeleteListings } from '@/hooks/useDeleteListings';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { sourceYad2Url } from '@/lib/yad2Ad';
import { mapLocalListingRow, type UnifiedResult } from '@/lib/propertySearch';

export function Yad2AdButton({ url }: { url: string }) {
  const status = useYad2AdStatus(url);
  if (status !== 'live') return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="פתח את המודעה ביד2" aria-label="פתח את המודעה ביד2"
      onClick={(e) => e.stopPropagation()} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
      <Yad2Icon className="h-5 w-5" />
    </a>
  );
}

export function PropertyRowActions({
  r, importing = false, onCampaign, onEdit, onDelete, onAffiliate, hideAffiliate = false,
}: {
  r: UnifiedResult;
  importing?: boolean;
  onCampaign: (r: UnifiedResult) => void;
  onEdit?: (r: UnifiedResult) => void;
  onDelete?: (r: UnifiedResult) => void;
  onAffiliate?: (r: UnifiedResult) => void;
  hideAffiliate?: boolean;
}) {
  const live = sourceYad2Url(r);
  return (
    <div className="inline-flex items-center gap-1.5">
      {live ? <Yad2AdButton url={live} /> : null}
      <Button size="icon" variant="ghost" title="צור קמפיין לנכס" aria-label="צור קמפיין לנכס" disabled={importing}
        onClick={(e) => { e.stopPropagation(); onCampaign(r); }} className="h-8 w-8">
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
      </Button>
      <PropertyShareMenu results={[r]} iconOnly variant="ghost" />
      {onEdit ? (
        <Button size="icon" variant="ghost" className="h-8 w-8" title="עריכת הנכס" aria-label="עריכת הנכס" onClick={() => onEdit(r)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="מחיקת נכס" aria-label="מחיקת נכס" onClick={() => onDelete(r)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
      {hideAffiliate ? null : onAffiliate ? (
        <Button size="icon" variant="ghost" className="h-8 w-8" title="הגדר שיווק שותפים" aria-label="הגדר שיווק שותפים" onClick={() => onAffiliate(r)}>
          <Handshake className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Public board: renders the /properties action bar only when the listing
 * belongs to the signed-in user's active workspace. Ownership is decided by
 * the listing's workspace_owner_id read through RLS, never by public data.
 */
export function OwnerListingActions({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const del = useDeleteListings();
  const [row, setRow] = useState<UnifiedResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setRow(null);
    if (!user?.id || !activeWorkspaceId) return;
    let alive = true;
    void supabase.from('listings').select('*').eq('id', listingId).eq('workspace_owner_id', activeWorkspaceId).maybeSingle()
      .then(({ data }) => { if (alive && data) setRow(mapLocalListingRow(data)); });
    return () => { alive = false; };
  }, [listingId, user?.id, activeWorkspaceId]);

  if (!row) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs font-semibold text-muted-foreground">ניהול המודעה שלי</span>
      <div className="flex items-center gap-1.5">
        <PropertyRowActions
          r={row}
          hideAffiliate
          onCampaign={(r) => navigate(`/campaigns?tab=create&channel=facebook&properties=${r.localId}&listing=${r.localId}`)}
          onDelete={() => setConfirm(true)}
        />
        <AffiliateCommissionButton listingId={listingId} />
      </div>
      <PropertyDeleteDialog count={1} open={confirm} deleting={del.isPending} onOpenChange={setConfirm}
        onConfirm={() => del.mutate([listingId], {
          onSuccess: () => { setConfirm(false); toast.success('הנכס נמחק'); window.location.reload(); },
          onError: (e: any) => toast.error(e?.message ?? 'המחיקה נכשלה'),
        })} />
    </div>
  );
}
