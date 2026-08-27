import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  Building2, Car, Footprints, GraduationCap, Handshake, RefreshCw, TrendingUp,
} from 'lucide-react';

export type Yad2SoldDeal = {
  address: string | null; date: string | null; price: number | null;
  rooms: number | null; sqm: number | null; floor: number | null; year_built: number | null;
};
export type Yad2PricePoint = { date: string | null; price: number | null; label?: string };
export type Yad2School = {
  name: string | null; type: string | null; grades: string | null;
  address: string | null; distance: string | null; supervision: string | null;
  walking_distance?: string | null; driving_distance?: string | null;
};
export type Yad2Sections = {
  sold_deals?: Yad2SoldDeal[];
  valuation_history?: Yad2PricePoint[];
  schools?: Yad2School[];
  fetched_at?: string;
};

const shekel = (v: number | null | undefined) =>
  v == null ? '—' : `₪${Number(v).toLocaleString('he-IL')}`;

function SectionShell({
  icon: Icon, title, count, children,
}: { icon: typeof Building2; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
        <Icon className="h-5 w-5 text-primary" /> {title}
        {count ? <Badge variant="outline" className="text-sm">{count}</Badge> : null}
      </h2>
      {children}
    </section>
  );
}

/**
 * Secondary Yad2 item-page sections: sold deals nearby, valuation history,
 * and education institutions. Data is imported by `yad2-page-sections`
 * and cached on the listing, so the card renders instantly on repeat visits.
 */
export function PropertyYad2SectionsCard({
  listingId,
  sourceUrl,
  sections,
}: {
  listingId: string;
  sourceUrl?: string | null;
  sections?: Yad2Sections | null;
}) {
  const qc = useQueryClient();
  const [live, setLive] = useState<Yad2Sections | null>(null);
  const data = live ?? sections ?? null;
  const isYad2 = !!sourceUrl && /yad2\.co\.il/.test(sourceUrl);

  const sync = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.functions.invoke('yad2-page-sections', {
        body: { listing_id: listingId, url: sourceUrl },
      });
      if (error) throw error;
      if (res?.error) throw new Error(String(res.detail ?? res.error));
      return res?.sections as Yad2Sections;
    },
    onSuccess: (res) => {
      setLive(res ?? null);
      const total =
        (res?.sold_deals?.length ?? 0) + (res?.schools?.length ?? 0) +
        (res?.valuation_history?.length ?? 0);
      toast.success(total ? `יובאו ${total} פריטים מיד2` : 'לא נמצאו סקשנים נוספים בעמוד המקור');
      void qc.invalidateQueries({ queryKey: ['property-detail', listingId] });
    },
    onError: (e: any) => toast.error(`ייבוא הסקשנים נכשל: ${e?.message ?? e}`),
  });

  if (!isYad2 && !data) return null;

  const deals = data?.sold_deals ?? [];
  const history = (data?.valuation_history ?? []).filter((p) => p?.price != null);
  const schools = data?.schools ?? [];
  const empty = !deals.length && !history.length && !schools.length;


  const chart = history.map((p, i) => ({ name: p.date || p.label || `#${i + 1}`, price: Number(p.price) }));

  return (
    <Card className="space-y-8 p-4 sm:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-foreground">מידע נוסף מעמוד המקור ביד2</h2>
        <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={`h-4 w-4 ms-1 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'מייבא…' : data ? 'רענון הנתונים' : 'ייבוא כל הסקשנים'}
        </Button>
      </div>

      {sync.isPending && !data && (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      )}

      {empty && !sync.isPending && (
        <p className="text-lg text-muted-foreground">
          עוד לא יובאו סקשנים מעמוד היד2. לחצו על "ייבוא כל הסקשנים" כדי לשלוף עסקאות באזור,
          היסטוריית שווי ומוסדות חינוך.
        </p>
      )}


      {chart.length > 1 && (
        <SectionShell icon={TrendingUp} title="היסטוריית שווי הנכס">
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} width={86} tickFormatter={(v) => `₪${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(v) => `₪${Number(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>
      )}

      {deals.length > 0 && (
        <SectionShell icon={Handshake} title="עסקאות אחרונות שנמכרו באזור" count={deals.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-lg">
              <thead>
                <tr className="border-b text-right text-base text-muted-foreground">
                  <th className="py-2 pe-2">תאריך</th>
                  <th className="py-2">כתובת</th>
                  <th className="py-2">חדרים</th>
                  <th className="py-2">מ״ר</th>
                  <th className="py-2">קומה</th>
                  <th className="py-2">שנת בנייה</th>
                  <th className="py-2 text-left">מחיר</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pe-2">{d.date ?? '—'}</td>
                    <td className="py-2">{d.address ?? '—'}</td>
                    <td className="py-2">{d.rooms ?? '—'}</td>
                    <td className="py-2">{d.sqm ?? '—'}</td>
                    <td className="py-2">{d.floor ?? '—'}</td>
                    <td className="py-2">{d.year_built ?? '—'}</td>
                    <td className="py-2 text-left font-medium tabular-nums">{shekel(d.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      )}

      {schools.length > 0 && (
        <SectionShell icon={GraduationCap} title="מוסדות חינוך באזור" count={schools.length}>
          <div className="grid max-h-[744px] grid-cols-1 gap-3 overflow-y-auto pe-1 scroll-smooth sm:max-h-[372px] sm:grid-cols-2 lg:max-h-[244px] lg:grid-cols-3" dir="rtl">
            {schools.map((s, i) => (
              <Card key={`${s.name ?? 'school'}-${i}`} className="h-[112px] min-w-0 p-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-lg font-semibold" title={s.name ?? ''}>{s.name}</p>
                  <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                    {s.type && <Badge variant="secondary" className="text-sm">{s.type}</Badge>}
                    {s.grades && <Badge variant="outline" className="text-sm">{s.grades}</Badge>}
                    {s.supervision && <Badge variant="outline" className="text-sm">{s.supervision}</Badge>}
                  </div>
                </div>
                {s.address && <p className="mt-1 text-base text-muted-foreground line-clamp-1" title={s.address}>{s.address}</p>}
                <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                  {(s.walking_distance || s.distance) && (
                    <span className="inline-flex items-center gap-1"><Footprints className="h-4 w-4" /> הליכה: {s.walking_distance || s.distance}</span>
                  )}
                  {s.driving_distance && (
                    <span className="inline-flex items-center gap-1"><Car className="h-4 w-4" /> נסיעה: {s.driving_distance}</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </SectionShell>
      )}


      {data?.fetched_at && (
        <p className="text-sm text-muted-foreground">
          מקור: יד2 · עודכן ב-{new Date(data.fetched_at).toLocaleString('he-IL')}
        </p>
      )}
    </Card>
  );
}

export default PropertyYad2SectionsCard;
