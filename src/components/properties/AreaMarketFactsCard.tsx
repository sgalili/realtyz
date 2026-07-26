import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import {
  TrendingUp, TrendingDown, BarChart3, GraduationCap, Trees, HeartPulse,
  Car, TrainFront, Waves, MapPin, Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getAreaMarketFacts } from '@/lib/areaMarketFacts';

type Props = {
  city: string | null | undefined;
  neighborhood?: string | null;
  dealType: 'sale' | 'rent';
  /** Local listing id — enables the live neighborhood amenities enrichment. */
  listingId?: string | null;
};

function fmt(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

// Amenity buckets requested for the area profile. Each perk sentence coming
// back from the enrichment function is routed into the first matching bucket.
const BUCKETS = [
  { key: 'edu', label: 'גנים, בתי ספר ומוסדות חינוך', icon: GraduationCap, re: /גן|גני|בית ספר|בתי ספר|תיכון|חינוך|מעון|אוניברסיט|מכלל/ },
  { key: 'green', label: 'פארקים ושטחים ירוקים', icon: Trees, re: /פארק|גינה|שטח ירוק|טיילת|מגרש משחקים|ספורט|פנאי/ },
  { key: 'health', label: 'בריאות ומרפאות', icon: HeartPulse, re: /מרפא|קופת חולים|בית חולים|רפוא|מד"?א|חירום/ },
  { key: 'roads', label: 'צירים ראשיים וכבישים', icon: Car, re: /כביש|נתיבי איילון|מחלף|צומת|כניסה לעיר|חני/ },
  { key: 'transit', label: 'תחבורה ציבורית ורכבת', icon: TrainFront, re: /רכבת|קו אוטובוס|אוטובוס|תחבורה|רכבת קלה|תחנת/ },
  { key: 'beach', label: 'מרחק מהים', icon: Waves, re: /ים|חוף|מרינה/ },
] as const;

export function AreaMarketFactsCard({ city, neighborhood, dealType, listingId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['area-market-facts', city, neighborhood, dealType],
    queryFn: () => getAreaMarketFacts(city, dealType, neighborhood),
    enabled: !!city,
    staleTime: 1000 * 60 * 30,
  });

  const { data: perks } = useQuery({
    queryKey: ['area-perks', listingId],
    enabled: !!listingId,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data: row } = await supabase
        .from('listings')
        .select('area_perks')
        .eq('id', listingId as string)
        .maybeSingle();
      const cached = (row as any)?.area_perks;
      if (cached?.perks?.length) return cached as { perks: string[]; one_liner_he?: string };
      const { data: fresh } = await supabase.functions.invoke('neighborhood-perks', {
        body: { listing_id: listingId },
      });
      return ((fresh as any)?.area_perks ?? null) as { perks: string[]; one_liner_he?: string } | null;
    },
  });

  useEffect(() => {
    // no-op: keeps the enrichment query lifecycle explicit for future extensions
  }, [listingId]);

  if (isLoading || !data) return null;

  const isRent = dealType === 'rent';
  const label = isRent ? 'שכירות' : 'מכירה';
  const perkList = perks?.perks ?? [];
  const buckets = BUCKETS.map((b) => ({
    ...b,
    items: perkList.filter((p) => b.re.test(p)),
  })).filter((b) => b.items.length > 0);
  const otherPerks = perkList.filter((p) => !BUCKETS.some((b) => b.re.test(p)));

  return (
    <Card className="p-4 sm:p-5" dir="rtl">
      <h2 className="text-xl font-bold text-primary mb-3 inline-flex items-center gap-2">
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
          className={`inline-flex items-center gap-1.5 text-lg font-semibold ${
            data.trendPct > 0 ? 'text-success' : 'text-destructive'
          }`}
        >
          {data.trendPct > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {data.trendPct > 0 ? 'עלייה' : 'ירידה'} של {Math.abs(data.trendPct)}% בשנה האחרונה
        </div>
      )}

      <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
        {data.highlights.map((h, i) => (
          <li key={i} className="text-lg text-foreground/80">• {h}</li>
        ))}
      </ul>

      {(buckets.length > 0 || otherPerks.length > 0) && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-lg font-bold text-foreground mb-3 inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            מה יש בסביבה הקרובה
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {buckets.map((b) => (
              <div key={b.key} className="rounded-md border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-base font-semibold text-foreground mb-1.5">
                  <b.icon className="h-4 w-4 text-primary" />
                  {b.label}
                </div>
                <ul className="space-y-1">
                  {b.items.map((it, i) => (
                    <li key={i} className="text-base text-foreground/80">• {it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {otherPerks.length > 0 && (
            <ul className="mt-3 space-y-1">
              {otherPerks.map((p, i) => (
                <li key={i} className="text-base text-foreground/70">• {p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data.comparables.length > 0 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <h3 className="text-lg font-bold text-foreground mb-3">
            עסקאות {isRent ? 'השכרה' : 'מכירה'} דומות באזור (5 שנים אחרונות)
          </h3>
          <div className="space-y-2">
            {data.comparables.map((c) => (
              <Link
                key={c.id}
                to={`/properties/${c.id}`}
                className="flex items-center gap-3 rounded-md border border-border/60 p-2 hover:bg-muted/40 transition-colors"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted border border-border/60">
                  {c.photo ? (
                    <img src={c.photo} alt={c.address ?? 'נכס'} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Building2 className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-foreground">
                    {c.address || c.neighborhood || c.city}
                  </p>
                  <p className="truncate text-[15px] text-muted-foreground">
                    {[
                      c.sqm ? `${c.sqm} מ"ר` : null,
                      c.rooms ? `${c.rooms} חדרים` : null,
                      new Date(c.soldAt).getFullYear(),
                      ...c.features,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 text-lg font-bold tabular-nums text-primary">{fmt(c.price)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[15px] text-muted-foreground tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-foreground truncate tabular-nums">{value}</p>
    </div>
  );
}
