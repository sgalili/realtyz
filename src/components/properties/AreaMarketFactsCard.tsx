import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { getAreaMarketFacts } from '@/lib/areaMarketFacts';

type Props = {
  city: string | null | undefined;
  neighborhood?: string | null;
  dealType: 'sale' | 'rent';
};

function fmt(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

/**
 * Real local market facts (last 5 years) for the property's area, strictly
 * matched to the transaction type: sale comparables for sale pages, rental
 * comparables for rentals.
 */
export function AreaMarketFactsCard({ city, neighborhood, dealType }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['area-market-facts', city, neighborhood, dealType],
    queryFn: () => getAreaMarketFacts(city, dealType, neighborhood),
    enabled: !!city,
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading || !data) return null;

  const isRent = dealType === 'rent';
  const label = isRent ? 'שכירות' : 'מכירה';

  return (
    <Card className="p-4 sm:p-5" dir="rtl">
      <h2 className="text-base font-bold text-primary mb-3 inline-flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        נתוני שוק באזור · {neighborhood || data.city} ({label})
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Stat label="עסקאות ב-5 שנים" value={`${data.sampleSize}`} />
        {data.avgPrice != null && (
          <Stat label={isRent ? 'שכ"ד ממוצע' : 'מחיר ממוצע'} value={fmt(data.avgPrice)} />
        )}
        {data.medianPrice != null && <Stat label="חציון" value={fmt(data.medianPrice)} />}
        {data.avgPricePerSqm != null && !isRent && (
          <Stat label='ממוצע למ"ר' value={fmt(data.avgPricePerSqm)} />
        )}
        {data.avgRooms != null && <Stat label="חדרים בממוצע" value={`${data.avgRooms}`} />}
        {data.avgSqm != null && <Stat label='שטח ממוצע' value={`${data.avgSqm} מ"ר`} />}
      </div>

      {data.trendPct != null && Math.abs(data.trendPct) >= 1 && (
        <div
          className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
            data.trendPct > 0 ? 'text-success' : 'text-destructive'
          }`}
        >
          {data.trendPct > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {data.trendPct > 0 ? 'עלייה' : 'ירידה'} של {Math.abs(data.trendPct)}% בשנה האחרונה
        </div>
      )}

      <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
        {data.highlights.map((h, i) => (
          <li key={i} className="text-sm text-foreground/80">• {h}</li>
        ))}
      </ul>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-foreground truncate tabular-nums">{value}</p>
    </div>
  );
}
