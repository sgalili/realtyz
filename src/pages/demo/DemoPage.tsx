import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Sparkles } from 'lucide-react';
import { DEMO_CONFIGS, DEMO_TYPES, RITA_CHAT, isDemoType } from './demoData';

interface DemoUnit { rooms?: unknown; floor?: unknown; price?: unknown; size?: unknown }
interface DemoProject { id: string; name: string; city?: string; apartments: DemoUnit[] }
interface DemoDeveloper { developer_id: string; developer_name: string; logo_url: string | null; project_count: number; unit_count: number; projects: DemoProject[] }

const fmt = (n: number) => Math.round(n).toLocaleString('he-IL');
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

function CtaBanner() {
  return (
    <div className="rounded-xl bg-primary text-primary-foreground p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="font-semibold text-center sm:text-right">אהבת את מה שאתה רואה? צא ממצב דמו ועבור לחשבון לייב מאומת</p>
      <Button asChild variant="secondary"><Link to="/auth">הצטרפות בחינם</Link></Button>
    </div>
  );
}

export default function DemoPage() {
  const { type } = useParams();
  const [tick, setTick] = useState(0);
  const [chatLen, setChatLen] = useState(2);
  const [unitProject, setUnitProject] = useState<DemoProject | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1500);
    const c = setInterval(() => setChatLen((v) => (v >= RITA_CHAT.length ? 2 : v + 1)), 2500);
    return () => { clearInterval(t); clearInterval(c); };
  }, []);

  const cfg = isDemoType(type) ? DEMO_CONFIGS[type] : null;
  const { data: developers = [] } = useQuery({
    queryKey: ['demo-top-developers'],
    enabled: !!cfg?.showDevelopers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('demo_top_developers');
      if (error) throw error;
      return (data ?? []) as unknown as DemoDeveloper[];
    },
  });

  if (!type) return <Navigate to="/demo/broker" replace />;
  if (!cfg) return <Navigate to="/demo/broker" replace />;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-4 space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" />מצב דמו לצפייה בלבד · כל הנתונים להמחשה</div>
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {DEMO_TYPES.map((t) => (
            <Link key={t.id} to={`/demo/${t.id}`} className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${t.id === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>{t.label}</Link>
          ))}
        </nav>
        <CtaBanner />
        <header><h1 className="text-2xl font-bold">{cfg.headline}</h1><p className="text-muted-foreground">{cfg.subtitle}</p></header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cfg.stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary animate-pulse" />{s.label}</div>
              <div className="text-xl font-bold tabular-nums">{s.suffix}{fmt(s.base + s.perTick * tick)}</div>
            </div>
          ))}
        </section>

        <div className="grid md:grid-cols-2 gap-4">
          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h2 className="font-semibold">{cfg.tableTitle}</h2>
            {cfg.rows.map((r) => (
              <div key={r.title} className="flex items-center justify-between gap-2 border-b border-border last:border-0 py-2">
                <div><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.meta}</div></div>
                <Badge variant="secondary">{r.status}</Badge>
              </div>
            ))}
          </section>
          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h2 className="font-semibold flex items-center gap-1"><Sparkles className="h-4 w-4 text-primary" />ריטה AI בשיחה חיה</h2>
            {RITA_CHAT.slice(0, chatLen).map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === 'rita' ? 'bg-primary/10 ms-auto' : 'bg-muted'}`}>{m.text}</div>
            ))}
          </section>
        </div>

        {cfg.campaigns.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-2">
            <h2 className="font-semibold">היסטוריית קמפיינים</h2>
            {cfg.campaigns.map((r) => (
              <div key={r.title} className="flex items-center justify-between py-1"><div><div>{r.title}</div><div className="text-xs text-muted-foreground">{r.meta}</div></div><Badge variant="outline">{r.status}</Badge></div>
            ))}
          </section>
        )}

        {cfg.showDevelopers && developers.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-semibold">10 היזמים המובילים</h2>
            {developers.map((d, i) => (
              <div key={d.developer_id} className="border-b border-border last:border-0 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5">{i + 1}</span>
                  {d.logo_url && <img src={d.logo_url} alt="" className="h-8 w-8 object-contain rounded" />}
                  <span className="font-medium">{d.developer_name}</span>
                  <span className="text-xs text-muted-foreground ms-auto">{d.project_count} פרויקטים · {d.unit_count} דירות</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {d.projects.map((p) => (
                    <button key={p.id} type="button" onClick={() => setUnitProject(p)} className="text-xs rounded-full border border-border px-2 py-1 hover:bg-muted">
                      {p.name}{p.city ? `, ${p.city}` : ''} ({p.apartments.length})
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <CtaBanner />
      </div>

      <Dialog open={!!unitProject} onOpenChange={(o) => !o && setUnitProject(null)}>
        <DialogContent dir="rtl" className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{unitProject?.name}</DialogTitle></DialogHeader>
          {unitProject?.apartments.length ? unitProject.apartments.map((a, i) => (
            <div key={i} className="rounded-lg border border-border p-2 text-sm">דירה {i + 1} · חדרים {txt(a.rooms)} · קומה {txt(a.floor)} · שטח {txt(a.size)} · מחיר {txt(a.price)}</div>
          )) : <p className="text-sm text-muted-foreground">אין דירות מפורסמות בפרויקט זה.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
