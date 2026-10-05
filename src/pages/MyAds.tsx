import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Eye, Loader2, MousePointerClick, Users, ImageIcon, Banknote, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useExclusiveExpansion } from '@/hooks/useExclusiveExpansion';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/pages/PublicListingPage';

type Row = {
  listing_id: string; relation: 'owned' | 'promoting'; title: string | null; city: string | null; address: string | null;
  deal_type: string | null; asking_price: number | null; slug: string | null; image_url: string | null;
  views: number; clicks: number; affiliates: number;
};
type Affiliate = { affiliate_id: string; name: string; clicks: number; leads: number; paid_bids: number; paid_count: number; since: string | null; last_activity: string | null };
type History = { id: string; at: string; type: string; amount: number; name: string };
type Details = { affiliates: Affiliate[]; history: History[]; history_started_at: string | null; has_older_history: boolean; owned: boolean };
const number = (value: number) => Number(value || 0).toLocaleString('he-IL');
const date = (value: string | null) => value ? new Date(value).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const labels: Record<string, string> = { view: 'צפייה במודעה', click: 'לחיצה על קישור', promotion: 'תחילת קידום', contact: 'איש קשר חדש', purchase: 'רכישת איש קשר' };

function AdDetails({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const history = useInfiniteQuery({
    queryKey: ['my-ad-history', user?.id, activeWorkspaceId, listingId],
    initialPageParam: 0,
    refetchInterval: 30_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_my_ad_history', { _listing_id: listingId, _offset: pageParam });
      if (error) throw error;
      return data as unknown as { items: History[]; total: number };
    },
    getNextPageParam: (last, pages) => { const count = pages.reduce((total, p) => total + p.items.length, 0); return count < last.total ? count : undefined; },
  });
  const events = history.data?.pages.flatMap(p => p.items) ?? [];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-ad-details', user?.id, activeWorkspaceId, listingId],
    refetchInterval: 30_000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_ad_details', { _listing_id: listingId });
      if (error) throw error;
      return data as unknown as Details;
    },
  });
  if (isLoading) return <div className="flex justify-center p-5"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError) return <div role="alert" className="p-4 text-sm">לא ניתן לטעון את הנתונים <Button variant="link" onClick={() => void refetch()}>ניסיון נוסף</Button></div>;
  return <div className="space-y-5 bg-muted/20 p-4">
    <section className="space-y-2">
      <h3 className="font-semibold">{data?.owned ? 'תוצאות השותפים' : 'תוצאות הקידום שלי'}</h3>
      {!data?.affiliates.length ? <p className="text-sm text-muted-foreground">אין עדיין שותפים מקדמים</p> : <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[680px] text-right text-sm">
          <thead><tr className="text-muted-foreground">{['שותף', 'קליקים', 'אנשי קשר', 'רכישות בתשלום', 'סכום ששולם', 'תחילת קידום', 'פעילות אחרונה'].map(t => <th key={t} className="p-2 font-medium">{t}</th>)}</tr></thead>
          <tbody>{data.affiliates.map(a => <tr key={a.affiliate_id} className="border-t"><td className="p-2 font-semibold">{a.name}</td><td className="p-2">{number(a.clicks)}</td><td className="p-2">{number(a.leads)}</td><td className="p-2">{number(a.paid_count)}</td><td className="p-2 whitespace-nowrap">₪{number(a.paid_bids)}</td><td className="p-2 whitespace-nowrap">{date(a.since)}</td><td className="p-2 whitespace-nowrap">{date(a.last_activity)}</td></tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">היסטוריית פעילות</h3>
      <p className="text-sm text-muted-foreground">צפיות וקליקים מהעבר נכללים במונים; פירוט לפי זמן זמין מתחילת תיעוד ההיסטוריה{data?.history_started_at ? ` (${date(data.history_started_at)})` : ''}.</p>
      {history.isError ? <p role="alert">לא ניתן לטעון את ההיסטוריה <Button variant="link" onClick={() => void history.refetch()}>ניסיון נוסף</Button></p> : history.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !events.length ? <p className="text-sm text-muted-foreground">אין עדיין פעילות מתועדת</p> : <ol className="max-h-80 divide-y overflow-y-auto">
        {events.map(h => <li key={h.id + h.type} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{labels[h.type] || 'פעילות'}</span>{h.name && <span className="text-muted-foreground">{h.name}</span>}{(h.type === 'view' || h.type === 'click') && h.amount > 1 && <span>×{number(h.amount)}</span>}{h.type === 'purchase' && <span className="text-success">₪{number(h.amount)}</span>}</div><time className="text-muted-foreground" dateTime={h.at}>{date(h.at)}</time></li>)}
      </ol>}
      {history.hasNextPage && <Button variant="ghost" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>פעילות קודמת</Button>}
    </section>
  </div>;
}
function AdCard({ row: r }: { row: Row }) {
  const { activeWorkspaceId } = useWorkspace();
  const [open, setOpen] = useExclusiveExpansion(`my-ads:${activeWorkspaceId}`, `${r.relation}:${r.listing_id}`);
  const title = [r.address, r.city].filter(Boolean).join(', ') || r.title || 'נכס';
  return <article className="min-w-0 overflow-hidden rounded-lg border bg-card" data-my-ad={r.listing_id}>
    <div className="flex min-w-0 gap-3 p-3">
      <Link to={`/p/${r.slug || r.listing_id}`} className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-label={title}>
        {r.image_url ? <img src={r.image_url} alt={title} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-7 w-7 text-muted-foreground" />}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <Link to={`/p/${r.slug || r.listing_id}`} className="block truncate font-semibold text-foreground" title={title}>{title}</Link>
        <p className="font-bold text-primary">{formatPrice(Number(r.asking_price) || 0, r.deal_type === 'rent' ? 'rent' : r.deal_type === 'sale' ? 'sale' : null)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {([{ icon: Eye, value: r.views, label: 'צפיות' }, { icon: MousePointerClick, value: r.clicks, label: 'קליקים' }, { icon: Users, value: r.affiliates, label: 'שותפים מקדמים' }]).map(({ icon: Icon, value, label }) => <Button key={label} variant="ghost" size="sm" className="h-auto gap-1.5 px-0 py-1 text-muted-foreground" aria-expanded={open} aria-controls={`stats-${r.relation}-${r.listing_id}`} onClick={() => setOpen(v => !v)}><Icon className="h-4 w-4" /><b className="text-foreground">{number(value)}</b>{label}</Button>)}
          <Button variant="ghost" size="sm" className="h-auto gap-1 px-0 py-1" onClick={() => setOpen(v => !v)} aria-expanded={open}><Banknote className="h-4 w-4" />פירוט<ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></Button>
        </div>
      </div>
    </div>
    <AnimatedExpansion open={open} id={`stats-${r.relation}-${r.listing_id}`}><AdDetails listingId={r.listing_id} /></AnimatedExpansion>
  </article>;
}
export default function MyAds() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-ads-stats', user?.id, activeWorkspaceId], enabled: !!user?.id && !!activeWorkspaceId,
    refetchInterval: 30_000, refetchOnWindowFocus: true,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_my_ads_stats'); if (error) throw error; return (data ?? []) as Row[]; },
  });
  return <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
    {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : isError ? <div role="alert">לא ניתן לטעון את המודעות <Button variant="link" onClick={() => void refetch()}>ניסיון נוסף</Button></div> : !data.length ? <p className="py-10 text-center text-muted-foreground">עדיין אין מודעות שפרסמת או נכסים שאתה מקדם.</p> : (['owned', 'promoting'] as const).map(relation => {
      const rows = data.filter(r => r.relation === relation);
      return rows.length ? <section key={relation} className="space-y-2"><h2 className="font-bold">{relation === 'owned' ? 'המודעות שלי' : 'נכסים שאני מקדם'} ({rows.length})</h2><div className="space-y-3">{rows.map(r => <AdCard key={r.listing_id} row={r} />)}</div></section> : null;
    })}
  </div>;
}
