// The /properties action bar (Yad2 ad, campaign, share, edit, delete, affiliate).
// Shared by the workspace table and the public board's owner-only expansion.
import { returnState } from "@/lib/returnNav";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handshake, Loader2, Megaphone, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import PropertyReferralButton from '@/components/public/PropertyReferralButton';
import { RewardDialog } from '@/pages/AffiliateNetwork';
import { PropertyDeleteDialog } from '@/components/properties/PropertyDeleteDialog';
import { Yad2Icon } from '@/components/properties/Yad2Icon';
import { useYad2AdStatus } from '@/hooks/useYad2AdStatus';
import { useDeleteListings } from '@/hooks/useDeleteListings';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
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
  r, importing = false, onCampaign, onEdit, onDelete, onAffiliate, hideAffiliate = false, hideSharePublish = false,
}: {
  r: UnifiedResult;
  importing?: boolean;
  onCampaign: (r: UnifiedResult) => void;
  onEdit?: (r: UnifiedResult) => void;
  onDelete?: (r: UnifiedResult) => void;
  onAffiliate?: (r: UnifiedResult) => void;
  hideAffiliate?: boolean;
  hideSharePublish?: boolean;
}) {
  const live = sourceYad2Url(r);
  return (
    <div className="inline-flex items-center gap-1.5">
      {live ? <Yad2AdButton url={live} /> : null}
      <Button size="icon" variant="ghost" title="צור קמפיין לנכס" aria-label="צור קמפיין לנכס" disabled={importing}
        onClick={(e) => { e.stopPropagation(); onCampaign(r); }} className="h-8 w-8">
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
      </Button>
      <PropertyShareMenu results={[r]} iconOnly variant="ghost" hidePublish={hideSharePublish} />
      {r.localId && <PropertyReferralButton listingId={r.localId} />}
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
      {hideAffiliate ? null : onAffiliate ? (() => {
        const raw = (r as any).raw ?? {};
        const active = !!raw.affiliate_enabled && Number(raw.affiliate_reward_amount ?? 0) > 0;
        return (
          <Button size="icon" variant="ghost" title={active ? 'שיווק שותפים פעיל' : 'הגדר שיווק שותפים'} aria-label={active ? 'שיווק שותפים פעיל' : 'הגדר שיווק שותפים'} onClick={() => onAffiliate(r)}
            className={`h-8 w-8 ${active ? 'bg-success/15 text-success hover:bg-success/25 hover:text-success' : ''}`}>
            <Handshake className="h-4 w-4" />
          </Button>
        );
      })() : null}
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
  const [raw, setRaw] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { isSuperAdmin } = useUserRole();
  useEffect(() => {
    if (!user?.id || (!activeWorkspaceId && !isSuperAdmin)) { setRow(null); return; }
    let alive = true;
    let q = supabase.from('listings').select('*').eq('id', listingId);
    // Super admin manages every ad like its owner; others only their active workspace.
    if (!isSuperAdmin) q = q.eq('workspace_owner_id', activeWorkspaceId as string);
    void q.maybeSingle()
      .then(({ data }) => { if (alive && data) { setRaw(data); setRow(mapLocalListingRow(data)); } });
    return () => { alive = false; };
  }, [listingId, user?.id, activeWorkspaceId, reloadKey, isSuperAdmin]);

  if (!row) return null;
  const live = sourceYad2Url(row);
  const rawAff = raw ?? {};
  const affiliateActive = !!rawAff.affiliate_enabled && Number(rawAff.affiliate_reward_amount ?? 0) > 0;
  return (
    <div className="relative flex items-center justify-start" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 bg-transparent hover:bg-transparent" title="ניהול המודעה שלי" aria-label="ניהול המודעה שלי">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="text-xs">ניהול המודעה שלי</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-sm" onSelect={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" /> שתף נכס
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 text-sm" onSelect={() => navigate(`/campaigns?tab=create&channel=facebook&properties=${row.localId}&listing=${row.localId}`, { state: returnState() })}>
            <Megaphone className="h-4 w-4" /> צור קמפיין לנכס
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 text-sm" onSelect={() => setRewardOpen(true)}>
            <Handshake className={`h-4 w-4 ${affiliateActive ? 'text-success' : ''}`} /> {affiliateActive ? 'שיווק שותפים פעיל' : 'הגדר שיווק שותפים'}
          </DropdownMenuItem>
          {live ? (
            <DropdownMenuItem asChild className="gap-2 text-sm">
              <a href={live} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Yad2Icon className="h-4 w-4" /> פתח ביד2
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="gap-2 text-sm" onSelect={() => navigate(`/properties/${listingId}`, { state: { ...returnState(), returnTo: window.location.pathname + window.location.search, openEdit: true } })}>
            <Pencil className="h-4 w-4" /> עריכת הנכס
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 text-sm text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" /> מחיקת נכס
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PropertyShareMenu results={[row]} iconOnly variant="ghost" hidePublish hideTrigger open={shareOpen} onOpenChange={setShareOpen} />
      <RewardDialog listing={rewardOpen ? raw : null} open={rewardOpen}
        onOpenChange={(v) => { setRewardOpen(v); if (!v) setReloadKey((k) => k + 1); }} />
      <PropertyDeleteDialog count={1} open={confirm} deleting={del.isPending} onOpenChange={setConfirm}
        onConfirm={() => del.mutate([listingId], {
          onSuccess: () => { setConfirm(false); toast.success('הנכס נמחק'); window.location.reload(); },
          onError: (e: any) => toast.error(e?.message ?? 'המחיקה נכשלה'),
        })} />
    </div>
  );
}
