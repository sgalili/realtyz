import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Brain, TrendingUp, AlertTriangle, Send, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { LOSS_REASONS } from '@/components/dealroom/LossReasonDialog';

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  LOSS_REASONS.map((r) => [r.value, r.labelHe]),
);

interface OutcomeIntel {
  window_days: number;
  totals: {
    total_leads: number;
    qualified: number;
    meeting_scheduled: number;
    won: number;
    lost: number;
    ghosted: number;
  };
  conversion_rate: number;
  qualification_rate: number;
  failure_reasons_overall: Array<{ reason: string; count: number }>;
  failure_by_deal_type: Array<{ deal_type: string; reason: string; count: number }>;
  failure_by_location: Array<{ city: string; reason: string; count: number }>;
  conversion_by_deal_type: Array<{ deal_type: string; total: number; won: number; rate: number }>;
  conversion_by_location: Array<{ city: string; total: number; won: number; rate: number }>;
}

interface FollowupSuggestion {
  lead_id: string;
  lead_name: string | null;
  phone: string | null;
  city: string | null;
  deal_type: string | null;
  interaction_outcome: string;
  last_outcome_at: string | null;
  days_silent: number;
  suggested_reason: string;
}

export function UdiIntelligenceCard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: intel, isLoading } = useQuery({
    queryKey: ['outcome-intelligence', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_outcome_intelligence', {
        _user_id: user!.id,
        _days: 90,
      });
      if (error) throw error;
      return data as OutcomeIntel;
    },
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['followup-suggestions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_followup_suggestions', {
        _user_id: user!.id,
      });
      if (error) throw error;
      return (data ?? []) as FollowupSuggestion[];
    },
  });

  const queueNudge = async (s: FollowupSuggestion) => {
    if (!user?.id) return;
    const firstName = (s.lead_name ?? '').split(' ')[0] || 'שלום';
    const body =
      s.interaction_outcome === 'Ghosted'
        ? `${firstName}, רק רציתי לוודא שלא פספסתי אותך. יש משהו ספציפי שאתה מחפש או שאשלח כמה אופציות חדשות שנכנסו השבוע?`
        : `${firstName}, חשבתי עליך — רוצה שנקבע סיור קצר בנכס מתאים השבוע?`;
    const { error } = await (supabase as any).from('autopilot_queue').insert({
      user_id: user.id,
      lead_id: s.lead_id,
      message_content: body,
      template_id: 'followup_nudge',
      status: 'pending',
    });
    if (error) { toast.error('הוספה לתור נכשלה: ' + error.message); return; }
    toast.success('טיוטת ניג\'וג נכנסה לתור Autopilot');
    qc.invalidateQueries({ queryKey: ['followup-suggestions'] });
  };

  const topReasons = useMemo(() => intel?.failure_reasons_overall?.slice(0, 5) ?? [], [intel]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline-block ml-2" />
          טוען Udi Intelligence...
        </CardContent>
      </Card>
    );
  }

  if (!intel || intel.totals.total_leads === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Udi Intelligence
          </CardTitle>
          <CardDescription>
            אין עדיין מספיק נתונים. ככל שתתייג/י תוצאות אינטראקציה (במיוחד "עסקה אבדה" / "נעלם" עם סיבה), הדשבורד הזה ייחשף יותר.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* KPI strip */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Udi Intelligence · 90 ימים אחרונים
          </CardTitle>
          <CardDescription className="text-xs">
            יחס המרה, סיבות אובדן מובילות, וניג'וגים מומלצים — מבוסס תיוגי תוצאות שלך.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="מתעניינים בתקופה" value={intel.totals.total_leads} />
            <Kpi label="הוסמכו" value={intel.totals.qualified + intel.totals.meeting_scheduled + intel.totals.won} />
            <Kpi label="עסקאות נסגרו" value={intel.totals.won} highlight />
            <Kpi label="אחוז המרה" value={`${intel.conversion_rate}%`} highlight />
            <Kpi label="אחוז הסמכה" value={`${intel.qualification_rate}%`} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top failure reasons */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" /> סיבות אובדן מובילות
            </CardTitle>
            <CardDescription className="text-xs">
              למה עסקאות אבדו או מתעניינים נעלמו (כולל הקשר נכס + מיקום).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topReasons.length === 0 && (
              <p className="text-xs text-muted-foreground">עדיין אין סיבות תיוג. תייג/י "עסקה אבדה" או "נעלם" עם סיבה.</p>
            )}
            {topReasons.map((r) => (
              <div key={r.reason} className="flex items-center justify-between text-sm">
                <span>{REASON_LABEL[r.reason] ?? r.reason}</span>
                <Badge variant="secondary">{r.count}</Badge>
              </div>
            ))}

            {intel.failure_by_deal_type.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">לפי סוג עסקה</p>
                <ul className="space-y-1 text-[12px]">
                  {intel.failure_by_deal_type.slice(0, 6).map((r, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {r.deal_type === 'sale' ? 'מכירה' : r.deal_type === 'rent' ? 'השכרה' : r.deal_type}
                        </Badge>
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                      <span className="text-muted-foreground">{r.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {intel.failure_by_location.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">לפי מיקום</p>
                <ul className="space-y-1 text-[12px]">
                  {intel.failure_by_location.slice(0, 6).map((r, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        <Badge variant="outline" className="ml-1 text-[10px]">{r.city}</Badge>
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                      <span className="text-muted-foreground">{r.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion split */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> המרה לפי סוג עסקה ומיקום
            </CardTitle>
            <CardDescription className="text-xs">איפה המודל שלך הכי חזק וחלש.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {intel.conversion_by_deal_type.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">סוג עסקה</p>
                <ul className="space-y-1 text-[12px]">
                  {intel.conversion_by_deal_type.map((r, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{r.deal_type === 'sale' ? 'מכירה' : r.deal_type === 'rent' ? 'השכרה' : r.deal_type}</span>
                      <span className="text-muted-foreground">{r.won}/{r.total} · {r.rate}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {intel.conversion_by_location.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">מיקום (Top 10)</p>
                <ul className="space-y-1 text-[12px]">
                  {intel.conversion_by_location.slice(0, 10).map((r, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{r.city}</span>
                      <span className="text-muted-foreground">{r.won}/{r.total} · {r.rate}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Follow-up suggestions */}
      <Card className="border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" /> ניג'וגים מומלצים ע"י ה-AI
          </CardTitle>
          <CardDescription className="text-xs">
            מתעניינים שנעלמו או מוסמכים שקפאו ≥3 ימים. שליחה ל-Autopilot Queue לאישורך.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">כרגע אין מתעניינים שדורשים ניג'וג. כל הכבוד.</p>
          ) : (
            suggestions.map((s) => (
              <div key={s.lead_id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2">
                <div className="text-[12px] flex-1">
                  <div className="font-medium">{s.lead_name ?? '(ללא שם)'}</div>
                  <div className="text-muted-foreground">
                    {s.city ? `${s.city} · ` : ''}
                    {s.deal_type === 'sale' ? 'מכירה' : s.deal_type === 'rent' ? 'השכרה' : ''}
                    {' · '}
                    שקט {s.days_silent} ימים · {s.suggested_reason}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => queueNudge(s)}>
                  <Send className="h-3.5 w-3.5" />
                  שלח ניג'וג
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}

export default UdiIntelligenceCard;
