import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MinusCircle,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
};

type HealthResult = {
  success?: boolean;
  overall?: 'ready' | 'degraded' | 'blocked';
  summary?: string;
  checked_at?: string;
  webhook_url?: string;
  checks?: Check[];
  error?: string;
};

const STATUS_ICON: Record<CheckStatus, JSX.Element> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  fail: <XCircle className="h-4 w-4 text-destructive" />,
  skip: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

const OVERALL_LABEL = {
  ready: { text: 'מוכן לייצור', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  degraded: { text: 'דורש תשומת לב', className: 'bg-amber-500 text-white hover:bg-amber-500' },
  blocked: { text: 'לא מוכן לייצור', className: 'bg-destructive text-destructive-foreground' },
} as const;

export function MetaWabaHealthCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-wa-health', { body: {} });
      if (error) {
        setResult({ error: 'בדיקת המוכנות נכשלה — נסה שוב.' });
      } else {
        setResult(data as HealthResult);
      }
    } catch {
      setResult({ error: 'בדיקת המוכנות נכשלה — נסה שוב.' });
    } finally {
      setLoading(false);
    }
  };

  const overall = result?.overall;

  return (
    <Card dir="rtl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              בדיקת מוכנות לייצור — Meta WhatsApp
            </CardTitle>
            <CardDescription>
              בדיקה חיה של תוקף הטוקן, ההרשאות, סטטוס המספר ונקודת ה-Webhook.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {overall && (
              <Badge className={OVERALL_LABEL[overall].className}>{OVERALL_LABEL[overall].text}</Badge>
            )}
            <Button size="sm" onClick={runCheck} disabled={loading}>
              {loading ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : null}
              בדוק סטטוס
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {result?.error && <p className="text-sm text-destructive">{result.error}</p>}

        {result?.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}

        {(result?.checks ?? []).map((c) => (
          <div key={c.id} className="flex items-start gap-3 rounded-md border p-3">
            <div className="mt-0.5 shrink-0">{STATUS_ICON[c.status]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.label}</p>
              <p
                className={`text-xs ${
                  c.status === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {c.message}
              </p>
            </div>
          </div>
        ))}

        {result?.webhook_url && (
          <p className="break-all text-[11px] text-muted-foreground">
            כתובת Webhook: {result.webhook_url}
          </p>
        )}
        {result?.checked_at && (
          <p className="text-[11px] text-muted-foreground">
            נבדק לאחרונה: {new Date(result.checked_at).toLocaleString('he-IL')}
          </p>
        )}
        {!result && !loading && (
          <p className="text-sm text-muted-foreground">
            לחץ על "בדוק סטטוס" כדי לאמת שהחיבור החי ל-Meta פעיל ומוכן לתעבורת ייצור.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
