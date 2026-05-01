import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Trophy, Calendar, XCircle, Ghost, UserCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type TemplateRow = {
  template_key: string;
  template_label: string | null;
  total_leads: number;
  won_count: number;
  scheduled_count: number;
  qualified_count: number;
  lost_count: number;
  ghosted_count: number;
  pending_count: number;
  success_rate: number;
};

const TEMPLATE_LABELS_HE: Record<string, string> = {
  soft_close: 'סגירה רכה',
  urgency: 'דחיפות',
  follow_up: 'מעקב',
  qualifying: 'איתור צרכים',
  property_match: 'התאמת נכס',
  outreach: 'פנייה ראשונית',
  meeting_invite: 'הזמנה לפגישה',
};

function prettyLabel(row: TemplateRow): string {
  if (row.template_label && row.template_label !== row.template_key) return row.template_label;
  return TEMPLATE_LABELS_HE[row.template_key] || row.template_key;
}

function rateTone(rate: number) {
  if (rate >= 70) return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30';
  if (rate >= 40) return 'text-amber-600 bg-amber-500/10 border-amber-500/30';
  return 'text-rose-600 bg-rose-500/10 border-rose-500/30';
}

function progressTone(rate: number) {
  if (rate >= 70) return 'bg-emerald-500';
  if (rate >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function TemplatePerformanceCard() {
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) {
          if (!cancelled) {
            setLoading(false);
            setRows([]);
          }
          return;
        }
        // @ts-expect-error - rpc not in generated types yet
        const { data, error } = await supabase.rpc('get_template_performance', {
          user_uuid: u.user.id,
        });
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          setRows((data ?? []) as TemplateRow[]);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const best = rows?.[0];
  const worst = rows && rows.length > 1 ? rows[rows.length - 1] : null;

  return (
    <Card className="p-5" dir="rtl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            ביצועי תבניות AI
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            אחוז ההצלחה (פגישה נקבעה או עסקה נסגרה) לכל תבנית פנייה
          </p>
        </div>
        {best && worst && best.template_key !== worst.template_key && (
          <Badge variant="outline" className="gap-1 hidden sm:inline-flex">
            <Sparkles className="h-3 w-3 text-primary" />
            תובנה
          </Badge>
        )}
      </div>

      {best && worst && best.template_key !== worst.template_key && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed mb-4">
          התבנית <strong>"{prettyLabel(best)}"</strong> שלך מצליחה ב‑
          <strong>{best.success_rate}%</strong> מהמקרים, בעוד שתבנית{' '}
          <strong>"{prettyLabel(worst)}"</strong> מסתכמת ב‑
          <strong>{worst.success_rate}%</strong>. שקול לאמן את ה‑AI לתעדף את
          הסגנון הראשון.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">שגיאה בטעינת הנתונים: {error}</div>
      ) : !rows || rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          אין עדיין נתוני תבניות. תייג תוצאות אינטראקציה כדי שהמערכת תלמד אילו תבניות עובדות.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.template_key} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="font-medium text-sm">{prettyLabel(r)}</div>
                <Badge variant="outline" className={cn('font-mono', rateTone(r.success_rate))}>
                  {r.success_rate}%
                </Badge>
              </div>
              <Progress
                value={r.success_rate}
                className="h-1.5 mb-2"
                indicatorClassName={progressTone(r.success_rate)}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Trophy className="h-3 w-3 text-emerald-600" />
                  נסגר: {r.won_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-amber-600" />
                  פגישה: {r.scheduled_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserCheck className="h-3 w-3 text-blue-600" />
                  מוסמך: {r.qualified_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-rose-600" />
                  אבד: {r.lost_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Ghost className="h-3 w-3 text-slate-500" />
                  נעלם: {r.ghosted_count}
                </span>
                <span className="ms-auto">סה״כ: {r.total_leads}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
