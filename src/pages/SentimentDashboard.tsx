import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Smile, Meh, Frown, TrendingUp, MapPin, Flame } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'hsl(var(--success))',
  neutral: 'hsl(25 95% 53%)',
  negative: 'hsl(var(--destructive))',
};

const DEMO_SENTIMENT_DIST = [
  { name: 'חיובי', key: 'positive', value: 1284, percent: 42 },
  { name: 'ניטרלי', key: 'neutral', value: 1070, percent: 35 },
  { name: 'שלילי', key: 'negative', value: 702, percent: 23 },
];

const DEMO_SENTIMENT_RADAR = [
  { subject: 'ביטחון', חיובי: 60, ניטרלי: 20, שלילי: 20, fullMark: 100 },
  { subject: 'כלכלה', חיובי: 30, ניטרלי: 40, שלילי: 30, fullMark: 100 },
  { subject: 'חברה', חיובי: 50, ניטרלי: 30, שלילי: 20, fullMark: 100 },
];

const DEMO_CITY_PULSE = [
  { city: 'תל אביב', positive: 650, neutral: 220, negative: 130, total: 1000, score: 65, positivePercent: 65 },
  { city: 'ירושלים', positive: 580, neutral: 260, negative: 160, total: 1000, score: 58, positivePercent: 58 },
  { city: 'חיפה', positive: 420, neutral: 350, negative: 230, total: 1000, score: 42, positivePercent: 42 },
  { city: 'באר שבע', positive: 510, neutral: 300, negative: 190, total: 1000, score: 51, positivePercent: 51 },
  { city: 'ראשון לציון', positive: 560, neutral: 280, negative: 160, total: 1000, score: 56, positivePercent: 56 },
  { city: 'נתניה', positive: 470, neutral: 330, negative: 200, total: 1000, score: 47, positivePercent: 47 },
  { city: 'אשדוד', positive: 390, neutral: 360, negative: 250, total: 1000, score: 39, positivePercent: 39 },
  { city: 'פתח תקווה', positive: 610, neutral: 240, negative: 150, total: 1000, score: 61, positivePercent: 61 },
];

const DEMO_TRENDING_TOPICS = [
  { word: '#יוקר_המחיה', count: 1240, volume: 'נפח קריטי', sentiment: 'סנטימנט שלילי', tone: 'negative' },
  { word: '#ביטחון_אישי', count: 920, volume: 'נפח גבוה', sentiment: 'סנטימנט מעורב', tone: 'neutral' },
  { word: '#אחדות_לאומית', count: 710, volume: 'נפח בצמיחה', sentiment: 'סנטימנט חיובי', tone: 'positive' },
];

const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'חיובי',
  neutral: 'ניטרלי',
  negative: 'שלילי',
};

const RADAR_LABELS: Record<string, string> = {
  security: 'ביטחון',
  economy: 'כלכלה',
  judicial: 'משפט',
  social: 'חברה',
  governance: 'ממשל',
};

const SentimentDashboard = () => {
  const { isDemoMode } = useDemoMode();
  useRealtimeSubscription('leads', [
    ['sentiment-distribution'],
    ['city-pulse'],
    ['sentiment-radar'],
    ['neighborhood-sentiment'],
  ]);
  useRealtimeSubscription('messages', [['trending-topics']]);

  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [animationReady, setAnimationReady] = useState(false);
  
  const [showAllCities, setShowAllCities] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimationReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // ─── Sentiment distribution ───
  const { data: sentimentDist } = useQuery({
    queryKey: ['sentiment-distribution'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('sentiment');
      const map: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
      data?.forEach((v) => {
        const s = v.sentiment || 'neutral';
        map[s] = (map[s] || 0) + 1;
      });
      const total = data?.length || 1;
      return Object.entries(map).map(([key, value]) => ({
        name: SENTIMENT_LABELS[key] || key,
        key,
        value,
        percent: Math.round((value / total) * 100),
      }));
    },
  });

  // ─── Sentiment-weighted radar (average interest scores by sentiment) ───
  const { data: sentimentRadar } = useQuery({
    queryKey: ['sentiment-radar'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('sentiment, interest_score_json');
      const buckets: Record<string, Record<string, number[]>> = {
        positive: {}, neutral: {}, negative: {},
      };
      Object.keys(RADAR_LABELS).forEach((k) => {
        buckets.positive[k] = [];
        buckets.neutral[k] = [];
        buckets.negative[k] = [];
      });
      data?.forEach((v) => {
        const s = v.sentiment || 'neutral';
        const scores = (v.interest_score_json as Record<string, number>) || {};
        Object.keys(RADAR_LABELS).forEach((k) => {
          buckets[s]?.[k]?.push(scores[k] || 0);
        });
      });
      const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
      return Object.keys(RADAR_LABELS).map((k) => ({
        subject: RADAR_LABELS[k],
        חיובי: avg(buckets.positive[k]),
        ניטרלי: avg(buckets.neutral[k]),
        שלילי: avg(buckets.negative[k]),
        fullMark: 100,
      }));
    },
  });

  // ─── City pulse ───
  const { data: cityPulse } = useQuery({
    queryKey: ['city-pulse'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('city, sentiment');
      const map = new Map<string, { positive: number; neutral: number; negative: number; total: number }>();
      data?.forEach((v) => {
        const city = v.city || 'לא ידוע';
        const s = v.sentiment || 'neutral';
        if (!map.has(city)) map.set(city, { positive: 0, neutral: 0, negative: 0, total: 0 });
        const entry = map.get(city)!;
        entry[s as 'positive' | 'neutral' | 'negative'] = (entry[s as 'positive' | 'neutral' | 'negative'] || 0) + 1;
        entry.total += 1;
      });
      return Array.from(map.entries())
        .map(([city, counts]) => ({
          city,
          ...counts,
          score: counts.total > 0
            ? Math.round(((counts.positive - counts.negative) / counts.total) * 100)
            : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);
    },
  });

  // ─── Trending topics from messages ───
  const { data: trendingTopics } = useQuery({
    queryKey: ['trending-topics'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('messages')
        .select('content')
        .gte('created_at', today.toISOString())
        .not('content', 'is', null);

      // Also get interest tags for extra signal
      const { data: voters } = await supabase.from('leads').select('interest_tag');

      const stopWords = new Set([
        'את', 'של', 'על', 'עם', 'לא', 'זה', 'יש', 'אני', 'הוא', 'היא',
        'אם', 'גם', 'כי', 'או', 'רק', 'כל', 'מה', 'לי', 'שלי', 'אבל',
        'the', 'is', 'to', 'a', 'and', 'in', 'of', 'it', 'for', 'that',
        'כן', 'אז', 'מי', 'לו', 'בו', 'כך', 'עד', 'אל', 'כמו',
      ]);
      const wordMap = new Map<string, number>();

      // Count words from messages
      data?.forEach((m) => {
        const words = (m.content || '').split(/[\s,.!?;:()[\]{}"']+/).filter((w: string) => w.length > 2);
        words.forEach((w: string) => {
          const lower = w.toLowerCase();
          if (!stopWords.has(lower)) {
            wordMap.set(lower, (wordMap.get(lower) || 0) + 1);
          }
        });
      });

      // Boost interest tags
      voters?.forEach((v) => {
        const tag = v.interest_tag;
        if (tag) wordMap.set(tag, (wordMap.get(tag) || 0) + 3);
      });

      return Array.from(wordMap.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    },
  });

  // ─── Neighborhood / city detail ───
  const selectedCityData = useMemo(() => {
    const activeCityPulse = isDemoMode ? DEMO_CITY_PULSE : cityPulse;
    if (!selectedCity || !activeCityPulse) return null;
    return activeCityPulse.find((c) => c.city === selectedCity) || null;
  }, [cityPulse, isDemoMode, selectedCity]);

  const overallSentiment = useMemo(() => {
    const activeSentimentDist = isDemoMode ? DEMO_SENTIMENT_DIST : sentimentDist;
    if (!activeSentimentDist) return { dominant: 'neutral', total: 0 };
    const total = activeSentimentDist.reduce((s, d) => s + d.value, 0);
    const dominant = activeSentimentDist.reduce((a, b) => (b.value > a.value ? b : a), activeSentimentDist[0]);
    return { dominant: dominant?.key || 'neutral', total };
  }, [isDemoMode, sentimentDist]);

  const activeSentimentDist = isDemoMode ? DEMO_SENTIMENT_DIST : sentimentDist;
  const activeSentimentRadar = isDemoMode ? DEMO_SENTIMENT_RADAR : sentimentRadar;
  const activeCityPulse = isDemoMode ? DEMO_CITY_PULSE : cityPulse;
  const activeTrendingTopics = isDemoMode ? DEMO_TRENDING_TOPICS : trendingTopics;
  const chartCityPulse = activeCityPulse?.map((c: any) => ({
    ...c,
    positivePercent: 'positivePercent' in c ? c.positivePercent : c.total ? Math.round((c.positive / c.total) * 100) : 0,
    neutralPercent: c.total ? Math.round((c.neutral / c.total) * 100) : 0,
    negativePercent: c.total ? Math.round((c.negative / c.total) * 100) : 0,
  }));
  const visibleCityCards = showAllCities ? chartCityPulse : chartCityPulse?.slice(0, 4);
  const maxTopicCount = activeTrendingTopics?.[0]?.count || 1;

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">ניתוח סנטימנט</h1>
          <p className="text-muted-foreground text-sm">דופק המתעניינים בזמן אמת, סנטימנט, נושאים חמים ומפת ערים</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {activeSentimentDist?.map((s) => (
          <Card key={s.key} className="border-border/80 bg-card">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center">
                {s.key === 'positive' && <Smile className="h-9 w-9" style={{ color: SENTIMENT_COLORS.positive }} />}
                {s.key === 'neutral' && <Meh className="h-9 w-9" style={{ color: SENTIMENT_COLORS.neutral }} />}
                {s.key === 'negative' && <Frown className="h-9 w-9" style={{ color: SENTIMENT_COLORS.negative }} />}
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-muted-foreground">{s.name}</p>
                <p className="text-2xl font-black text-primary"><AnimatedNumber value={animationReady ? s.value : 0} /></p>
                <p className="text-xs text-muted-foreground"><AnimatedNumber value={animationReady ? s.percent : 0} />%</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Radar + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment radar */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              מכ״ם סנטימנט לפי נושא
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={activeSentimentRadar ?? []} cx="50%" cy="50%" outerRadius="85%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="חיובי" dataKey="חיובי" stroke={SENTIMENT_COLORS.positive} fill={SENTIMENT_COLORS.positive} fillOpacity={0.2} />
                  <Radar name="ניטרלי" dataKey="ניטרלי" stroke={SENTIMENT_COLORS.neutral} fill={SENTIMENT_COLORS.neutral} fillOpacity={0.15} />
                  <Radar name="שלילי" dataKey="שלילי" stroke={SENTIMENT_COLORS.negative} fill={SENTIMENT_COLORS.negative} fillOpacity={0.15} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {Object.entries(SENTIMENT_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_COLORS[key as keyof typeof SENTIMENT_COLORS] }} />
                  <span className="text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment distribution pie */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">התפלגות סנטימנט כללית</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={activeSentimentDist ?? []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3}>
                    {activeSentimentDist?.map((s) => (
                      <Cell key={s.key} fill={SENTIMENT_COLORS[s.key as keyof typeof SENTIMENT_COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {activeSentimentDist?.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: SENTIMENT_COLORS[s.key as keyof typeof SENTIMENT_COLORS] }} />
                  <span className="text-muted-foreground">{s.name} ({s.percent}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* City Pulse + Trending Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* City Pulse */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              דופק העיר - סנטימנט לפי אזור
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartCityPulse ?? []} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="city" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
                          <p className="font-semibold">{d.city}</p>
                          <p style={{ color: SENTIMENT_COLORS.positive }}>חיובי: {d.positivePercent}%</p>
                          <p style={{ color: SENTIMENT_COLORS.neutral }}>ניטרלי: {d.neutralPercent}%</p>
                          <p style={{ color: SENTIMENT_COLORS.negative }}>שלילי: {d.negativePercent}%</p>
                          <p className="text-muted-foreground">ציון נטו: {d.score}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="positivePercent" stackId="sentiment" fill={SENTIMENT_COLORS.positive} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="neutralPercent" stackId="sentiment" fill={SENTIMENT_COLORS.neutral} />
                  <Bar dataKey="negativePercent" stackId="sentiment" fill={SENTIMENT_COLORS.negative} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Interactive city cards */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {visibleCityCards?.map((c: any) => {
                const isSelected = selectedCity === c.city;
                const scoreColor = c.score > 20 ? SENTIMENT_COLORS.positive : c.score < -20 ? SENTIMENT_COLORS.negative : SENTIMENT_COLORS.neutral;
                return (
                  <button
                    key={c.city}
                    onClick={() => setSelectedCity(isSelected ? null : c.city)}
                    className={`rounded-lg border p-2.5 text-right transition-all text-xs hover:shadow-md ${
                      isSelected ? 'border-primary bg-primary/5 shadow-md' : 'border-border/50 hover:border-border'
                    }`}
                  >
                    <p className="font-medium truncate">{c.city}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground">{c.total} מתעניינים</span>
                      <span className="font-bold" style={{ color: scoreColor }}>{c.positivePercent}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {(chartCityPulse?.length ?? 0) > 4 && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllCities((value) => !value)}
                  className="rounded-md border border-primary/20 bg-background px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary/40"
                >
                  {showAllCities ? 'הצג פחות ערים' : 'הצג את כל הערים'}
                </button>
              </div>
            )}
            {/* Detail panel */}
              {selectedCityData && (
              <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-bottom-2">
                <h4 className="font-semibold text-sm mb-3">{selectedCityData.city}, פירוט סנטימנט</h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <Smile className="h-5 w-5 mx-auto mb-1" style={{ color: SENTIMENT_COLORS.positive }} />
                    <p className="text-lg font-bold" style={{ color: SENTIMENT_COLORS.positive }}>{selectedCityData.positive}</p>
                    <p className="text-[10px] text-muted-foreground">מרוצים</p>
                  </div>
                  <div>
                    <Meh className="h-5 w-5 mx-auto mb-1" style={{ color: SENTIMENT_COLORS.neutral }} />
                    <p className="text-lg font-bold" style={{ color: SENTIMENT_COLORS.neutral }}>{selectedCityData.neutral}</p>
                    <p className="text-[10px] text-muted-foreground">ניטרליים</p>
                  </div>
                  <div>
                    <Frown className="h-5 w-5 mx-auto mb-1" style={{ color: SENTIMENT_COLORS.negative }} />
                    <p className="text-lg font-bold" style={{ color: SENTIMENT_COLORS.negative }}>{selectedCityData.negative}</p>
                    <p className="text-[10px] text-muted-foreground">לא מרוצים</p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden flex">
                  <div style={{ width: `${(selectedCityData.positive / selectedCityData.total) * 100}%`, background: SENTIMENT_COLORS.positive }} />
                  <div style={{ width: `${(selectedCityData.neutral / selectedCityData.total) * 100}%`, background: SENTIMENT_COLORS.neutral }} />
                  <div style={{ width: `${(selectedCityData.negative / selectedCityData.total) * 100}%`, background: SENTIMENT_COLORS.negative }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trending Topics */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              נושאים חמים היום
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!activeTrendingTopics || activeTrendingTopics.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">אין מספיק שיחות היום לניתוח</p>
            ) : (
              <>
                {/* Word cloud style */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {activeTrendingTopics.slice(0, 12).map((t, i) => {
                    const ratio = t.count / maxTopicCount;
                    const size = ratio > 0.7 ? 'text-base font-bold' : ratio > 0.4 ? 'text-sm font-medium' : 'text-xs';
                    const opacity = Math.max(0.5, ratio);
                    return (
                      <Badge
                        key={t.word}
                        variant="secondary"
                        className={`${size} cursor-default transition-transform hover:scale-110`}
                        style={{ opacity }}
                      >
                        {t.word}
                      </Badge>
                    );
                  })}
                </div>
                {/* Ranked list */}
                <div className="space-y-2">
                  {activeTrendingTopics.slice(0, 8).map((t, i) => (
                    <div key={t.word} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium truncate">{t.word}</span>
                          <span className="text-muted-foreground">{'volume' in t ? `${(t as any).volume} · ${(t as any).sentiment}` : t.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(t.count / maxTopicCount) * 100}%`,
                              background: SENTIMENT_COLORS['tone' in t ? (t as any).tone : i === 1 ? 'negative' : i === 2 ? 'positive' : 'neutral'],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 900;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{displayValue.toLocaleString()}</>;
}

export default SentimentDashboard;
