import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type MatchRow = {
  id: string;
  lead_id: string;
  listing_id: string;
  match_score: number;
  match_reasons: string[];
  status: string;
  created_at: string;
  leads: { full_name: string | null } | null;
  listings: { property_title: string | null; city: string | null } | null;
};

/**
 * AI Matching KPI card. Shows today's automated match activity and
 * surfaces the top 3 hot matches with a shortcut to the Deal Room.
 * Also pushes a toast when a fresh high-confidence match arrives.
 */
export function MatchProgressCard() {
  const { user } = useAuth();

  const { data, refetch } = useQuery({
    queryKey: ['match-progress', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const [{ count: todayCount }, { count: weekCount }, { data: hot }] = await Promise.all([
        supabase.from('deal_room_matches').select('id', { count: 'exact', head: true })
          .eq('broker_id', user!.id).gte('created_at', since.toISOString()),
        supabase.from('deal_room_matches').select('id', { count: 'exact', head: true })
          .eq('broker_id', user!.id).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()),
        supabase.from('deal_room_matches')
          .select('id, lead_id, listing_id, match_score, match_reasons, status, created_at, leads(full_name), listings(property_title, city)')
          .eq('broker_id', user!.id)
          .order('match_score', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const rows = (hot as unknown as MatchRow[]) ?? [];
      const avg = rows.length ? Math.round(rows.reduce((a, r) => a + Number(r.match_score || 0), 0) / rows.length) : 0;
      return { today: todayCount ?? 0, week: weekCount ?? 0, avg, hot: rows };
    },
  });

  // Realtime: pop a toast when a new hot match arrives.
  const seenIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`match-alerts-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'deal_room_matches',
        filter: `broker_id=eq.${user.id}`,
      }, (payload: any) => {
        const row = payload?.new;
        if (!row || seenIds.current.has(row.id)) return;
        seenIds.current.add(row.id);
        if (Number(row.match_score) >= 70) {
          toast.success('🎯 התאמה חמה חדשה!', {
            description: `ציון ${Math.round(Number(row.match_score))} — פתח את חדר העסקאות`,
            action: { label: 'צפה', onClick: () => { window.location.href = '/deal-room'; } },
          });
          refetch();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refetch]);

  const today = data?.today ?? 0;
  const week = data?.week ?? 0;
  const avg = data?.avg ?? 0;
  const hot = data?.hot ?? [];

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          מנוע התאמות AI
          <Badge variant="secondary" className="mr-auto text-[10px]">פעיל</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="text-xs text-muted-foreground">היום</div>
            <div className="text-xl font-bold text-primary">{today}</div>
          </div>
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="text-xs text-muted-foreground">7 ימים</div>
            <div className="text-xl font-bold">{week}</div>
          </div>
          <div className="rounded-lg bg-background/60 border p-2">
            <div className="text-xs text-muted-foreground">ציון ממוצע</div>
            <div className="text-xl font-bold flex items-center justify-center gap-1">
              {avg}<TrendingUp className="h-3 w-3 text-emerald-500" />
            </div>
          </div>
        </div>

        {hot.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">התאמות חמות</div>
            {hot.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border bg-card/50 p-2 text-sm">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {Math.round(Number(m.match_score))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.leads?.full_name ?? 'ליד'}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.listings?.property_title ?? 'נכס'} · {m.listings?.city ?? ''}
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="h-7 gap-1 shrink-0">
                  <Link to="/deal-room"><Zap className="h-3 w-3" />חבר</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-background/40 p-3 text-xs text-muted-foreground text-center">
            עדיין אין התאמות. המנוע סורק ברקע — יופיעו כאן ברגע שיזוהו.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
