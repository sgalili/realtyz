import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Eye, Loader2, MousePointerClick, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice } from '@/pages/PublicListingPage';

type Row = {
  listing_id: string; relation: 'owned' | 'promoting'; title: string | null; city: string | null; address: string | null;
  deal_type: string | null; asking_price: number | null; slug: string | null; image_url: string | null;
  views: number; clicks: number; affiliates: number;
};

function Stat({ icon: Icon, value, label }: { icon: typeof Eye; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <Icon className="h-3.5 w-3.5" /><b className="text-foreground">{Number(value).toLocaleString('he-IL')}</b>{label}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-foreground">{title} ({rows.length})</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <Link key={r.listing_id} to={`/p/${r.slug || r.listing_id}`} className="flex min-w-0 gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">
            {r.image_url ? <img src={r.image_url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" /> : null}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-semibold text-foreground">{[r.address, r.city].filter(Boolean).join(', ') || r.title || 'נכס'}</p>
              <p className="text-sm font-bold text-primary">{formatPrice(Number(r.asking_price) || 0, r.deal_type === 'rent' ? 'rent' : r.deal_type === 'sale' ? 'sale' : null)}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Stat icon={Eye} value={r.views} label="צפיות" />
                <Stat icon={MousePointerClick} value={r.clicks} label="קליקים" />
                <Stat icon={Users} value={r.affiliates} label="שותפים מקדמים" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function MyAds() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ['my-ads-stats', user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_ads_stats');
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const owned = data.filter((r) => r.relation === 'owned');
  const promoting = data.filter((r) => r.relation === 'promoting');

  return (
    <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : !data.length ? <p className="py-10 text-center text-sm text-muted-foreground">עדיין אין מודעות שמקודמות על ידי שותפים או שאתה מקדם.</p>
        : <>
            <Section title="הנכסים שלי שמקודמים על ידי שותפים" rows={owned} />
            <Section title="נכסים שאני מקדם" rows={promoting} />
          </>}
    </div>
  );
}
