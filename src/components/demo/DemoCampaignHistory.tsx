import { useEffect, useState } from 'react';
import { Eye, MessageCircle, Share2, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEMO_COMMENTS, DEMO_POST_LIMIT, demoPost, demoProperties, simulatedMetrics, type DemoProperty } from '@/lib/publicDemoModel';

export function usePublicDemoProperties(enabled = true) {
  const [properties, setProperties] = useState<DemoProperty[]>(() => demoProperties([]));
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    // Explicitly anonymous projection, even when a signed-in viewer opens the simulation.
    void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listings-board?limit=5&offset=0`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, credentials: 'omit', signal: controller.signal,
    }).then(async response => { if (!response.ok) return; const body = await response.json(); if (!controller.signal.aborted) setProperties(demoProperties(Array.isArray(body.properties) ? body.properties : [])); }).catch(() => {}).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [enabled]);
  return properties;
}

export function useSimulationTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) setTick(value => value + 1); }, 5000); return () => window.clearInterval(timer); }, []);
  return tick;
}

export function DemoCampaignHistory({ properties: supplied }: { properties?: DemoProperty[] }) {
  const loaded = usePublicDemoProperties(supplied === undefined);
  const properties = (supplied ?? loaded).slice(0, DEMO_POST_LIMIT);
  const tick = useSimulationTick();
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="space-y-4" dir="rtl" aria-label="היסטוריית קמפיינים בהדגמה">
    <p className="text-sm text-muted-foreground">הדגמה בלבד · פרטי נכסים ותגמולים הותאמו · המונים והתגובות מדומים</p>
    {properties.map((property, index) => { const metrics = simulatedMetrics(index, tick); return <article key={property.id} className="overflow-hidden rounded-lg border border-border bg-card" data-demo-post>
      <header className="flex items-center justify-between gap-3 border-b border-border p-3"><div><p className="font-semibold">TORAFF · נדל״ן ב{property.city}</p><p className="text-xs text-muted-foreground">פייסבוק · פורסם בהדגמה · {index + 1} קבוצות</p></div><span className="text-sm text-success">פורסם</span></header>
      <p className="whitespace-pre-wrap p-4 text-base leading-relaxed">{demoPost(property, index)}</p>
      {property.photo && <img src={property.photo} alt={`נכס ציבורי ב${property.city}`} className="aspect-[16/9] w-full object-cover" loading="lazy" />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm text-muted-foreground" aria-label="מונים מדומים"><span className="inline-flex items-center gap-1"><ThumbsUp className="h-4 w-4" />{metrics.likes}</span><span className="inline-flex items-center gap-1"><Share2 className="h-4 w-4" />{metrics.shares}</span><span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" />{metrics.views}</span><Button variant="ghost" size="sm" className="ms-auto gap-1" aria-expanded={expanded === property.id} onClick={() => setExpanded(expanded === property.id ? null : property.id)}><MessageCircle className="h-4 w-4" />{metrics.comments} תגובות</Button></div>
      {expanded === property.id && <div className="space-y-3 border-t border-border p-4">{DEMO_COMMENTS.slice(0, metrics.comments).map(comment => <div key={comment.name}><p className="font-semibold">{comment.name}</p><p>{comment.text}</p><div className="mt-2 border-s-2 border-primary ps-3 text-sm"><p className="font-semibold text-primary">ריטה · TORAFF</p><p>{comment.reply}</p></div></div>)}</div>}
    </article>; })}
  </div>;
}