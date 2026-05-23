import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PriceTag } from '@/components/PriceTag';
import { Building2, MapPin, ExternalLink, TrendingUp, AlertCircle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';

const CORE_CITIES = ['הרצליה', 'רמת השרון', 'כפר שמריהו'] as const;

/* ---------------- Pipeline A: Homely ---------------- */
function HomelyPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['properties-hub-homely'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('homely-search', {
        body: { limit: 24 },
      });
      if (error) throw error;
      return (data?.results ?? []) as Array<{
        id?: string; property_title?: string; address?: string;
        city?: string; asking_price?: number; image_url?: string;
        status?: string; rooms?: number;
      }>;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Card className="p-10 text-center space-y-4 border-dashed">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold">חבר את Homely כדי לראות את המאגר שלך</p>
          <p className="text-sm text-muted-foreground mt-1">
            ברגע שמפתח Homely יוגדר, כל הנכסים הפעילים יוצגו כאן בזמן אמת.
          </p>
        </div>
        <Button asChild variant="default">
          <Link to="/api-settings">חיבור Homely</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((p, idx) => (
        <Card key={p.id ?? idx} className="overflow-hidden hover:shadow-lg transition-shadow">
          {p.image_url ? (
            <div className="aspect-[4/3] bg-muted overflow-hidden">
              <img src={p.image_url} alt={p.property_title ?? ''} className="w-full h-full object-cover" loading="lazy" />
            </div>
          ) : (
            <div className="aspect-[4/3] bg-muted flex items-center justify-center">
              <Building2 className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-tight line-clamp-1">{p.property_title ?? 'נכס'}</h3>
              {p.status && <Badge variant="secondary" className="shrink-0">{p.status}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {[p.address, p.city].filter(Boolean).join(', ')}
            </p>
            {p.asking_price ? (
              <div className="text-lg font-bold text-primary">
                <PriceTag value={p.asking_price} />
              </div>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Pipeline B: Yad2 RSS ---------------- */
function Yad2Panel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['properties-hub-yad2'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('yad2-market-pulse', { body: {} });
      if (error) throw error;
      return data as { cities: Record<string, { items: Array<{ title: string; link: string; description: string; pubDate: string }> }>, errors: Record<string, string> };
    },
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (error) return <Card className="p-6 text-sm text-destructive">שגיאה בטעינת נתוני Yad2</Card>;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        מקור: Yad2 RSS · עודכן כל 30 דקות · ערוץ פר עיר בליבת השטח של המתווך
      </p>
      {CORE_CITIES.map((city) => {
        const items = data?.cities?.[city]?.items ?? [];
        const err = data?.errors?.[city];
        return (
          <div key={city}>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> {city}
              <Badge variant="outline" className="text-xs">{items.length} מודעות</Badge>
            </h3>
            {err ? (
              <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> לא ניתן לטעון כעת ({err})
              </Card>
            ) : items.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">אין מודעות חדשות</Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {items.slice(0, 8).map((it, i) => (
                  <Card key={i} className="p-3 hover:bg-accent transition-colors">
                    <a href={it.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
                      <ExternalLink className="h-4 w-4 mt-1 shrink-0 text-muted-foreground group-hover:text-primary" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{it.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{it.description.replace(/<[^>]+>/g, '')}</p>
                      </div>
                    </a>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Pipeline C: Nadlan analytics ---------------- */
function NadlanPanel() {
  const [city, setCity] = useState<typeof CORE_CITIES[number]>('הרצליה');
  const { data, isLoading, error } = useQuery({
    queryKey: ['properties-hub-nadlan', city],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('gov-nadlan-lookup', { body: { city } });
      if (error) throw error;
      return data as {
        summary: { avgPricePerSqm: number | null; dealCount: number; trend: Array<{ month: string; avg: number }> };
        recent: Array<{ date: string; price: number; rooms: number | null; area_m2: number | null; address: string }>;
        attribution: string;
      };
    },
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">עיר:</span>
        <Select value={city} onValueChange={(v) => setCity(v as typeof CORE_CITIES[number])}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CORE_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : error ? (
        <Card className="p-6 text-sm text-destructive">שגיאה בטעינת נתוני נדל״ן ממשלתיים</Card>
      ) : !data ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">מחיר ממוצע למ״ר</p>
              <div className="text-2xl font-bold text-primary mt-1">
                {data.summary.avgPricePerSqm ? <PriceTag value={data.summary.avgPricePerSqm} /> : '—'}
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">עסקאות מאומתות</p>
              <div className="text-2xl font-bold mt-1">{data.summary.dealCount.toLocaleString('he-IL')}</div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> מגמת 12 חודשים</p>
              <div className="h-12 mt-1">
                {data.summary.trend.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.summary.trend}>
                      <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <XAxis dataKey="month" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <RTooltip formatter={(v: number) => `₪${v.toLocaleString('he-IL')}`} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-muted-foreground">אין מספיק נתונים</p>}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="font-semibold mb-3">10 עסקאות אחרונות מאומתות</h3>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין עסקאות לתצוגה</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-2">תאריך</th>
                      <th className="py-2">כתובת</th>
                      <th className="py-2">חדרים</th>
                      <th className="py-2">מ״ר</th>
                      <th className="py-2 text-left">מחיר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((d, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-2 whitespace-nowrap">{d.date.slice(0, 10)}</td>
                        <td className="py-2">{d.address}</td>
                        <td className="py-2">{d.rooms ?? '—'}</td>
                        <td className="py-2">{d.area_m2 ?? '—'}</td>
                        <td className="py-2 text-left font-medium"><PriceTag value={d.price} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-xs text-muted-foreground text-center">{data.attribution}</p>
        </>
      )}
    </div>
  );
}

/* ---------------- Page shell ---------------- */
export default function PropertiesHub() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4" dir="rtl">
      <Tabs defaultValue="homely" className="w-full">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-3 sm:grid-cols-3">
          <TabsTrigger value="homely">מאגר Homely חי</TabsTrigger>
          <TabsTrigger value="yad2">Yad2 — דופק שוק</TabsTrigger>
          <TabsTrigger value="nadlan">נדל״ן — אנליטיקה</TabsTrigger>
        </TabsList>

        <TabsContent value="homely" className="mt-6"><HomelyPanel /></TabsContent>
        <TabsContent value="yad2" className="mt-6"><Yad2Panel /></TabsContent>
        <TabsContent value="nadlan" className="mt-6"><NadlanPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
