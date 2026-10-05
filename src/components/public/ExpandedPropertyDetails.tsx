import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { normalizeListing, formatPrice } from '@/pages/PublicListingPage';

/** Every public detail we hold for one property, rendered inside the expanded board row. */
export default function ExpandedPropertyDetails({ idOrSlug }: { idOrSlug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['public-listing-expanded', idOrSlug],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listing-view?id=${encodeURIComponent(idOrSlug)}`;
      const res = await fetch(endpoint, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload?.property ? normalizeListing(payload.property, payload.attribution) : null;
    },
  });

  if (isLoading) return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const specs = [
    data.rooms ? { label: 'חדרים', value: String(data.rooms) } : null,
    data.sqm ? { label: 'מ״ר', value: String(data.sqm) } : null,
    data.floor !== null ? { label: 'קומה', value: String(data.floor) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="min-w-0 space-y-3 text-sm">
      <div className="min-w-0">
        <p className="break-words font-bold text-foreground">{data.title}</p>
        <p className="font-bold text-primary">{formatPrice(data.price, data.dealType)}</p>
      </div>
      {specs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {specs.map((s) => <span key={s.label} className="rounded-md border px-2 py-1 text-xs"><b>{s.value}</b> {s.label}</span>)}
        </div>
      )}
      {data.description && <p className="whitespace-pre-line break-words text-foreground">{data.description}</p>}
      {[{ title: 'פרטים', rows: data.details }, ...data.groups].filter((g) => g.rows.length).map((group) => (
        <div key={group.title} className="border-t pt-2">
          <h3 className="mb-1 text-xs font-bold text-foreground">{group.title}</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {group.rows.map((row, i) => (
              <div key={`${row.label}-${i}`} className="min-w-0">
                {row.label && <dt className="text-xs text-muted-foreground">{row.label}</dt>}
                <dd className="break-words text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {(data.brokerName || data.officeName) && (
        <p className="border-t pt-2 text-xs text-muted-foreground">
          {[data.officeName, data.brokerName, data.brokerLicenceNumber ? `רישיון ${data.brokerLicenceNumber}` : ''].filter((v) => v && !v.includes('לא צוין')).join(' · ')}
        </p>
      )}
    </div>
  );
}
