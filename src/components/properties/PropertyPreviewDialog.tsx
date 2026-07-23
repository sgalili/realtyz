import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BedDouble, Ruler, MapPin, ExternalLink, Loader2, Send, Building2, Layers } from 'lucide-react';
import { SourceBadge } from '@/components/properties/SourceBadge';
import { LISTING_TYPE_LABELS_HE } from '@/lib/homelyMockProperties';
import { formatListingTitle } from '@/lib/formatListingTitle';
import { stripAddressNumbers } from '@/lib/formatAddress';
import type { UnifiedResult } from '@/lib/propertySearch';
import { fetchLivePreview, mergeLive } from '@/lib/propertyLivePreview';

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

export function PropertyPreviewDialog({
  open,
  onOpenChange,
  result,
  onImport,
  importing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  result: UnifiedResult | null;
  onImport?: (r: UnifiedResult) => void;
  importing?: boolean;
}) {
  // Live, on-the-fly enrichment. When the dialog opens for an external row we
  // fetch fresh details straight from the source (no DB write) and merge them
  // into the displayed result. Import is still explicit — only fires when the
  // user clicks "ייבא ופתח".
  const [enriched, setEnriched] = useState<UnifiedResult | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  useEffect(() => {
    if (!open || !result) { setEnriched(null); return; }
    setEnriched(result);
    if (result.localId) return; // local rows: already the source of truth
    let cancelled = false;
    setLoadingLive(true);
    fetchLivePreview(result)
      .then((live) => {
        if (cancelled) return;
        setEnriched(mergeLive(result, live));
      })
      .finally(() => { if (!cancelled) setLoadingLive(false); });
    return () => { cancelled = true; };
  }, [open, result]);

  const r = enriched ?? result;
  const photos = (r?.photos ?? []).filter(Boolean);
  const isRent = r?.listing_type === 'rent';
  const label = r
    ? formatListingTitle({ address: r.address, city: r.city, property_type: r.property_type, title: r.title }) ||
      r.title
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {r && <SourceBadge source={r.source} compact />}
            <span>{label || 'תצוגת נכס'}</span>
          </DialogTitle>
          <DialogDescription>
            {loadingLive
              ? 'טוען פרטי נכס חיים מהמקור…'
              : r?.description
                ? r.description.slice(0, 180)
                : 'תצוגה מקדימה — לחץ "ייבא ופתח" כדי לשמור למאגר.'}
          </DialogDescription>
        </DialogHeader>

        {r && (
          <div className="space-y-4">
            {photos.length > 0 ? (
              <div className="aspect-[16/10] bg-muted rounded-md overflow-hidden">
                <div className="h-full w-full overflow-x-auto flex snap-x snap-mandatory">
                  {photos.map((src, i) => (
                    <img
                      key={`${src}-${i}`}
                      src={src}
                      alt=""
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className="h-full w-full min-w-full object-cover snap-center"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="aspect-[16/10] bg-muted rounded-md flex items-center justify-center text-muted-foreground text-sm">
                אין תמונה זמינה
              </div>
            )}

            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="text-2xl font-bold text-success inline-flex items-center gap-2">
                <Building2 className="h-5 w-5 opacity-60" />
                {r.price ? (
                  <>
                    {formatPrice(r.price)}
                    {isRent && <span className="text-sm font-normal text-muted-foreground"> /חודש</span>}
                  </>
                ) : (
                  <span className="text-base font-semibold text-amber-600">פרטים חסרים</span>
                )}
              </div>
              {r.listing_type && (
                <Badge className={isRent ? 'bg-[#0b3982] text-white' : 'bg-primary text-primary-foreground'}>
                  {LISTING_TYPE_LABELS_HE[r.listing_type]}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {r.city && (
                <div className="inline-flex items-center gap-1.5 text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {r.city}
                </div>
              )}
              {r.address && (
                <div className="inline-flex items-center gap-1.5 text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {stripAddressNumbers(r.address)}
                </div>
              )}
              {r.rooms != null && (
                <div className="inline-flex items-center gap-1.5 text-foreground">
                  <BedDouble className="h-4 w-4 text-primary" />
                  {r.rooms} חד'
                </div>
              )}
              {r.size_sqm != null && (
                <div className="inline-flex items-center gap-1.5 text-foreground">
                  <Ruler className="h-4 w-4 text-primary" />
                  {r.size_sqm} מ"ר
                </div>
              )}
              {r.floor != null && (
                <div className="inline-flex items-center gap-1.5 text-foreground">
                  <Layers className="h-4 w-4 text-primary" />
                  קומה {r.floor}
                </div>
              )}
            </div>

            {r.description && (
              <div className="rounded-md border p-3 text-sm leading-relaxed whitespace-pre-line text-foreground/80 max-h-48 overflow-y-auto">
                {r.description}
              </div>
            )}

            {r.url && (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                פתח במקור
              </a>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
          {r && !r.localId && onImport && (
            <Button onClick={() => onImport(r)} disabled={importing} className="gap-1.5">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              ייבא ופתח
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
