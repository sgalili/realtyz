import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import { LeadPricingInfo } from '@/components/affiliate/LeadPricingDialog';
import { normalizeListing } from '@/pages/PublicListingPage';
import { publicUrl } from '@/lib/publicUrl';
import type { MarketplaceListing } from '@/hooks/useAffiliate';

export function CopyListingLinkButton({ listingId }: { listingId: string }) {
  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" title="העתקת קישור" aria-label="העתקת קישור"
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(publicUrl(`/p/${encodeURIComponent(listingId)}`)); toast.success('הקישור הועתק'); }
        catch { toast.error('העתקת הקישור נכשלה'); }
      }}>
      <Link2 className="h-4 w-4" />
    </Button>
  );
}

/** Full property details for the partner board, with a sticky action bar. */
export function PartnerPropertyModal({ listing, onClose, actions }: { listing: MarketplaceListing | null; onClose: () => void; actions?: ReactNode }) {
  const id = listing?.listing_id ?? '';
  const { data } = useQuery({
    queryKey: ['public-listing-expanded', id],
    enabled: !!listing,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listing-view?id=${encodeURIComponent(id)}`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      if (!res.ok) return null;
      const payload = await res.json();
      if (!payload?.property) return null;
      return { listing: normalizeListing(payload.property, payload.attribution), raw: payload.property as Record<string, unknown> };
    },
  });
  return (
    <Dialog open={!!listing} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {listing && <>
          <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background px-4 py-2 pe-12">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{listing.property_title || 'פרטי נכס'}</DialogTitle>
              <DialogDescription className="sr-only">כל פרטי הנכס, המפרסם והעמלות</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">{actions}<CopyListingLinkButton listingId={listing.listing_id} /></div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <ExpandedPropertyDetails idOrSlug={listing.listing_id} />
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="font-bold">עמלות לפי סוג ליד</h3>
              <LeadPricingInfo listing={listing} details={(data?.raw ?? {}) as never} />
            </section>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
