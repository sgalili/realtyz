import { tagShareText, withShareUtm } from '@/lib/shareTracking';
import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import { publicUrl } from '@/lib/publicUrl';
import type { MarketplaceListing } from '@/hooks/useAffiliate';
import PropertyContactActions from '@/components/public/PropertyContactActions';

export function CopyListingLinkButton({ listingId }: { listingId: string }) {
  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" title="העתקת קישור" aria-label="העתקת קישור"
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(withShareUtm(publicUrl(`/p/${encodeURIComponent(listingId)}`), 'copy')); toast.success('הקישור הועתק'); }
        catch { toast.error('העתקת הקישור נכשלה'); }
      }}>
      <Link2 className="h-4 w-4" />
    </Button>
  );
}

/** Full property details for the partner board, with a sticky action bar. */
export function PartnerPropertyModal({ listing, onClose, actions }: { listing: MarketplaceListing | null; onClose: () => void; actions?: ReactNode }) {
  return (
    <Dialog open={!!listing} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {listing && <>
          <div className="sr-only">
              <DialogTitle>{listing.property_title || 'פרטי נכס'}</DialogTitle>
              <DialogDescription className="sr-only">כל פרטי הנכס, המפרסם והעמלות</DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-10 lg:p-5 lg:pt-10">
            <ExpandedPropertyDetails key={listing.listing_id} idOrSlug={listing.listing_id} actions={actions} />
            <PropertyContactActions listingId={listing.listing_id} title={listing.property_title || 'פרטי נכס'} compact formAsButton showShare={false} className="sticky bottom-0 z-20 bg-card pb-2 pt-1" />
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
