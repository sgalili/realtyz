import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Brain, CheckCircle2, Lightbulb, MessageSquareText, Search, Timer, TrendingUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getDemoConversationAnalytics } from '@/lib/demoData';

const METRIC_ICONS: Record<string, typeof MessageSquareText> = {
  analyzed: MessageSquareText,
  response: Timer,
  conversion: CheckCircle2,
};

const chartConfig = {
  conversations: { label: 'נפח שיחות', color: 'hsl(var(--primary-glow))' },
  sentiment: { label: 'Sentiment Score', color: 'hsl(var(--success))' },
};

const ConversationAnalytics = () => {
  const { demoCandidateId } = useDemoMode();
  const { activityMetrics, topicCloud, volumeSentimentData, aiInsights, sampleConversations } = useMemo(
    () => getDemoConversationAnalytics(demoCandidateId),
    [demoCandidateId],
  );
  const [search, setSearch] = useState('');
  const filteredConversations = useMemo(() => {
    const query = search.trim();
    if (!query) return sampleConversations;
    return sampleConversations.filter((row) => `${row.source} ${row.status} ${row.snippet}`.includes(query));
  }, [search, sampleConversations]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">אנליטיקס שיחות</h1>
          <p className="mt-1 text-sm text-muted-foreground">סימולציית תובנות AI משיחות WhatsApp, SMS ותמלולים</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {activityMetrics.map((metric) => {
          const Icon = METRIC_ICONS[metric.key] ?? MessageSquareText;
          return (
            <Card key={metric.label} className="border-primary/15 bg-card shadow-sm">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="space-y-1 text-right">
                  <p className="text-xs font-semibold text-muted-foreground">{metric.label}</p>
                  <p className="text-3xl font-black text-primary">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.subtext}</p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="min-w-0 max-w-full overflow-hidden border-primary/15 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-primary">
              <Brain className="h-4 w-4" /> ענן נושאים
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="flex min-h-[260px] min-w-0 max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-3 overflow-hidden rounded-md bg-secondary/55 p-4 text-center sm:gap-x-6 sm:gap-y-5 sm:p-6">
              {topicCloud.map((topic) => (
                <span key={topic.label} className={`${topic.size} ${topic.weight} max-w-full whitespace-normal break-words leading-tight text-primary`}>
                  {topic.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 max-w-full overflow-hidden border-primary/15 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-primary">
              <TrendingUp className="h-4 w-4" /> Sentiment vs. Volume
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 max-w-full overflow-hidden px-2 sm:px-6">
            <ChartContainer config={chartConfig} className="h-[260px] w-full min-w-0 max-w-full sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volumeSentimentData} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="left" width={28} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="right" orientation="right" width={28} domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ direction: 'rtl', background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Line yAxisId="left" type="monotone" dataKey="conversations" name="נפח שיחות" stroke="hsl(var(--primary-glow))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--primary-glow))' }} />
                  <Line yAxisId="right" type="monotone" dataKey="sentiment" name="Sentiment Score" stroke="hsl(var(--success))" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(var(--success))' }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
            <p className="mt-3 text-xs text-muted-foreground">אירוע Crisis מדומה בשעה 16:00 מציג ירידה בסנטימנט והתאוששות לאחר תגובת AI.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {aiInsights.map((insight) => (
          <Card key={insight} className="border-primary/15 bg-card">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm leading-relaxed text-foreground">{insight}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/15 bg-card">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base text-primary">דוגמאות שיחה חיות</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש בדוגמאות..." className="pr-9 text-right" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[7rem_8rem_1fr] bg-secondary px-4 py-3 text-xs font-bold text-primary">
              <span>מקור</span>
              <span>סטטוס</span>
              <span>Snippet</span>
            </div>
            {filteredConversations.map((row) => (
              <div key={`${row.source}-${row.snippet}`} className="grid grid-cols-[7rem_8rem_1fr] border-t border-border px-4 py-3 text-sm">
                <span className="font-semibold text-primary">{row.source}</span>
                <span className="text-muted-foreground">{row.status}</span>
                <span className="truncate text-foreground">{row.snippet}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConversationAnalytics;
