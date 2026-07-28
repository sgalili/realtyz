// Publication date cell for the listings table.
// Shows the real source date when we have it stored; otherwise probes the
// live Yad2 ad page (batched, shared with the liveness check) and shows the
// date Yad2 itself reports. Never falls back to our import timestamp.
import { formatSourceDate, formatIsoDate } from '@/lib/listingDates';
import { sourceYad2Url } from '@/lib/yad2Ad';
import { useYad2AdDates } from '@/hooks/useYad2AdStatus';

export function ListingDateCell({ row }: { row: any }) {
  const stored = formatSourceDate(row);
  const url = stored ? '' : sourceYad2Url(row);
  const probed = useYad2AdDates(url || null);
  const live = formatIsoDate(probed?.published_at ?? probed?.updated_at ?? null);
  return <span>{stored ?? live ?? '—'}</span>;
}

export default ListingDateCell;
