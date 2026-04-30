import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { VOTES_PER_MANDATE } from '@/lib/mandateCalculator';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getDemoCandidateSummary } from '@/lib/demoData';

export function NextMilestoneWidget() {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['user-subscription', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_subscriptions')
        .select('mandate_target, hot_list_count, cold_list_count, hot_conversion_rate, cold_conversion_rate')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: voterCount, isLoading: countLoading } = useQuery({
    queryKey: ['lead-count-supporters'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('status', ['supporter', 'active', 'voted']);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  if (!isDemoMode && (subLoading || countLoading)) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const demoSummary = getDemoCandidateSummary(demoCandidateId);

  // Real-mode empty state — no subscription target and no leads yet.
  // Show a real, neutral CTA instead of computing fake "next transaction" math.
  if (!isDemoMode && !subscription?.mandate_target && (voterCount ?? 0) === 0) {
    return (
      <Card className="border-dashed border-border/70 bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-center text-muted-foreground">
            אבן דרך הבאה
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-2 py-4">
          <p className="text-sm text-foreground">עדיין אין נתוני קמפיין במערכת שלך.</p>
          <p className="text-xs text-muted-foreground">
            הגדר יעד עסקאות בעמוד המנוי וייבא את רשימת הלידים שלך כדי לראות את אבן הדרך הבאה.
          </p>
        </CardContent>
      </Card>
    );
  }

  const mandateTarget = isDemoMode ? demoSummary.mandateTarget : (subscription?.mandate_target ?? 0);
  const hotRate = subscription?.hot_conversion_rate ?? 40;
  const coldRate = subscription?.cold_conversion_rate ?? 10;
  const supporters = isDemoMode ? Math.min(demoSummary.supporters, Math.floor(demoSummary.targetVotes * 0.82)) : (voterCount ?? 0);
  const currentMandates = supporters / VOTES_PER_MANDATE;
  const nextMandate = Math.floor(currentMandates) + 1;
  const cappedNext = Math.min(nextMandate, mandateTarget);
  const votersForNext = cappedNext * VOTES_PER_MANDATE;
  const votersNeeded = Math.max(0, votersForNext - supporters);
  const hotContactsToConvert = Math.ceil((votersNeeded * 0.6) / Math.max(0.01, hotRate / 100));
  const coldContactsToConvert = Math.ceil((votersNeeded * 0.4) / Math.max(0.01, coldRate / 100));
  const contactsToConvert = hotContactsToConvert + coldContactsToConvert;
  const progressInThisMandate = supporters - Math.floor(currentMandates) * VOTES_PER_MANDATE;
  const pct = Math.round((progressInThisMandate / VOTES_PER_MANDATE) * 100);
  const reachedTarget = !isDemoMode && currentMandates >= mandateTarget;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-center gap-2 text-center">
          {reachedTarget ? (
            <>יעד הקמפיין הושג!</>
          ) : (
            <>אבן דרך הבאה</>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reachedTarget ? (
          <div className="text-center py-2">
            <p className="text-3xl font-black text-primary">{Math.floor(currentMandates)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              עסקאות מובטחים · עברת את היעד של {mandateTarget}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-muted-foreground">להשגת <strong>עסקה</strong> #{cappedNext}</p>
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-3xl font-black tabular-nums text-primary">
                    {contactsToConvert.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">אנשי קשר להמרה לפי אחוזי ההמרה שלך</p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1 text-xs">
                <TrendingUp className="h-3 w-3" />
                {pct}%
              </Badge>
            </div>
            <Progress value={pct} className="h-2" />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{votersNeeded.toLocaleString()} קולות חסרים</span>
              <span>יעד: {mandateTarget} <strong>עסקאות</strong></span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
