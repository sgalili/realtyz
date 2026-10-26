import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtCreditsShort } from '@/lib/credits';
import { scrapingAlerts, scrapingFeatureName, type ScrapingReport } from '@/lib/scrapingReport';

export function ScrapingUsageReport() {
  const { user } = useAuth();
  const { isSuperAdmin, loading, error } = useUserRole();
  const [days, setDays] = useState(14);
  const [live, setLive] = useState(false);
  const q = useQuery({ queryKey: ['scraping-report', user?.id, days], enabled: !!user && isSuperAdmin && !loading && !error, staleTime: 15000, refetchInterval: live ? 30000 : false, refetchIntervalInBackground: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_scraping_usage_report', { _days: days }); if (error) throw error; return data as unknown as ScrapingReport; } });
  const provider = useQuery({ queryKey: ['scraping-provider-report', user?.id, days], enabled: !!user && isSuperAdmin && !loading && !error, staleTime: 300000, retry: false,
    queryFn: async () => { const { data, error } = await supabase.functions.invoke('brightdata-usage', { body: { days } }); if (error || !data?.ok) throw new Error('provider_unavailable'); return data as { totals: { cost: number | null; requests: number | null }; items: { date: string | null; zone: string | null; requests: number | null; cost: number | null; label: string }[] }; } });
  if (!user || loading || error || !isSuperAdmin) return null;
  const report = q.data;
  const alerts = report ? scrapingAlerts(report) : [];
  const attempts = report?.features.reduce((n, row) => n + row.attempts, 0) ?? 0;
  const hits = report?.features.reduce((n, row) => n + row.cache_hits, 0) ?? 0;
  const download = () => { if (!report) return; const blob = new Blob([JSON.stringify({ ...report, provider: provider.data ?? null }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `toraff-usage-${days}days.json`; a.click(); URL.revokeObjectURL(url); };
  return <section dir="rtl" className="space-y-5" aria-label="דוח שימוש Bright Data">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Activity className="h-5 w-5 text-primary" />שימוש וסריקות Bright Data</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(days)} onValueChange={value => setDays(Number(value))}><SelectTrigger className="w-28" aria-label="תקופת הדוח"><SelectValue /></SelectTrigger><SelectContent>{[1,7,14,30].map(n => <SelectItem key={n} value={String(n)}>{n} ימים</SelectItem>)}</SelectContent></Select>
        <Button size="icon" variant="outline" title="רענון" aria-label="רענון דוח שימוש" disabled={q.isFetching} onClick={() => { void q.refetch(); void provider.refetch(); }}><RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /></Button>
        <Button size="icon" variant="outline" title="הורדת הדוח" aria-label="הורדת דוח שימוש" disabled={!report} onClick={download}><Download className="h-4 w-4" /></Button>
        <label className="flex items-center gap-2 text-sm"><Switch checked={live} onCheckedChange={setLive} aria-label="עדכון חי" />עדכון חי</label>
      </div>
    </div>
    {q.isError ? <p role="alert" className="text-destructive">לא ניתן לקרוא את הדוח. נסו לרענן.</p> : !report ? <p className="text-muted-foreground">טוען נתוני שימוש…</p> : <>
      <div className="grid grid-cols-2 gap-4 border-y py-4 sm:grid-cols-4">
        {[['פעולות שנמדדו', attempts],['תשובות מהמטמון', hits],['עלות ספק בדולר', provider.data?.totals.cost != null ? `$${provider.data.totals.cost.toFixed(2)}` : 'לא זמין'],['חיובי TORAFF', fmtCreditsShort(report.credits.reduce((n,c) => n+c.credits,0))]].map(([label,value]) => <div key={label} className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="break-words text-xl font-bold tabular-nums">{value}</p></div>)}
      </div>
      <p className="text-xs text-muted-foreground">{new Date(report.from).toLocaleString('he-IL')} – {new Date(report.to).toLocaleString('he-IL')} · עודכן {new Date(report.checked_at).toLocaleTimeString('he-IL')}</p>
      <div aria-live="polite" className="space-y-2">{alerts.map(alert => <p key={alert} className="flex items-start gap-2 border-s-2 border-warning ps-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{alert}</p>)}</div>
      <p className="text-sm">בשעה האחרונה: {report.last_hour.attempts} פעולות · {report.last_hour.errors} שגיאות · {fmtCreditsShort(report.last_hour.credits)} בחיובי TORAFF</p>
      <h3 className="font-semibold">פעולות לפי שירות</h3>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow>{['שירות / פעולה','ניסיונות','הצליחו','שגיאות','מטמון','בתהליך','זמן ממוצע','נפח תשובות'].map(t => <TableHead key={t} className="whitespace-nowrap text-right">{t}</TableHead>)}</TableRow></TableHeader><TableBody>{report.features.map(row => <TableRow key={`${row.feature}:${row.operation}`}><TableCell className="min-w-40">{scrapingFeatureName(row.feature)}<span className="block text-xs text-muted-foreground">{row.operation}</span></TableCell>{[row.attempts,row.successes,row.errors,row.cache_hits,row.in_flight,row.avg_ms == null ? '—' : `${row.avg_ms} ms`, `${(row.bytes/1024).toFixed(1)} KB`].map((v,i) => <TableCell key={i} className="whitespace-nowrap tabular-nums">{v}</TableCell>)}</TableRow>)}</TableBody></Table></div>
      {!report.features.length && <p className="text-sm text-muted-foreground">טרם נמדדו פעולות בתקופה זו. המעקב החדש אינו משחזר קריאות עבר.</p>}
      <h3 className="font-semibold">צריכת קרדיטים לפי שירות</h3>
      {report.credits.length ? report.credits.map(row => <div key={row.feature} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{row.feature} · {row.charges} חיובים</span><span>{fmtCreditsShort(row.credits)}</span></div>) : <p className="text-sm text-muted-foreground">אין חיובי פעולה רשומים בתקופה הנבחרת.</p>}
      <h3 className="font-semibold">תדירות יומית</h3>
      {report.daily.map(row => <div key={row.day} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{row.day}</span><span>{row.attempts} פעולות · {row.cache_hits} מטמון · {row.errors} שגיאות</span></div>)}
      <h3 className="font-semibold">ריצות מתוזמנות אחרונות</h3>
      {report.runs.slice(0,10).map(row => <div key={row.claimed_at} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{new Date(row.claimed_at).toLocaleString('he-IL')}</span><span>{row.status} · {row.scraped_count} נכסים · {row.new_count} חדשים</span></div>)}
      <h3 className="font-semibold">פירוט Bright Data</h3>
      {provider.data?.items.map((row,i) => <div key={i} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{row.date} · {row.zone} · {row.label}</span><span>{row.requests ?? '—'} קריאות · {row.cost == null ? 'עלות חסרה' : `$${row.cost.toFixed(2)}`}</span></div>)}
      {!provider.data?.items.length && <p className="text-sm text-muted-foreground">פירוט עלויות הספק לא זמין. אין להסיק מכך שהסריקות ללא עלות.</p>}
      <p className="text-xs text-muted-foreground">עלות הספק אינה קרדיטים של TORAFF. חיבורי דפדפן וניווטים נספרים בנפרד; בקשות פנימיות של האתר ועלות לפי שירות אינן ניתנות לשיוך ללא פירוט הספק. התראות אינן עוצרות פעילות.</p>
    </>}
  </section>;
}