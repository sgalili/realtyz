import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Activity, MessageCircle, Sparkles, Phone, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDemoMode } from "@/hooks/useDemoMode";

type ServiceKey = "whatsapp_message" | "ai_tokens" | "sms" | "voice_minutes";

const SERVICE_META: Record<ServiceKey, { label: string; unit: string; icon: typeof MessageCircle; defaultLimit: number }> = {
  whatsapp_message: { label: "הודעות WhatsApp", unit: "הודעות", icon: MessageCircle, defaultLimit: 1000 },
  ai_tokens:        { label: "טוקני AI",        unit: "טוקנים",  icon: Sparkles,       defaultLimit: 200000 },
  sms:              { label: "הודעות SMS",     unit: "הודעות", icon: Send,            defaultLimit: 500 },
  voice_minutes:    { label: "דקות שיחה קולית", unit: "דקות",   icon: Phone,           defaultLimit: 120 },
};

const SOFT_THRESHOLD = 0.9;

function formatNumber(n: number): string {
  return new Intl.NumberFormat("he-IL").format(Math.round(n));
}

export function UsageMeterPanel() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();

  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);

  const { data: usageRows = [], isLoading: usageLoading } = useQuery({
    queryKey: ["usage_logs_month", user?.id, isDemoMode, monthStart],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_logs")
        .select("service_type, quantity, is_demo, created_at")
        .eq("user_id", user!.id)
        .eq("is_demo", isDemoMode)
        .gte("created_at", monthStart);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: limits = [] } = useQuery({
    queryKey: ["budget_limits", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_limits")
        .select("service_type, monthly_limit, hard_stop")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const usageByService = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of usageRows as any[]) {
      map[row.service_type] = (map[row.service_type] ?? 0) + Number(row.quantity ?? 0);
    }
    return map;
  }, [usageRows]);

  const services = useMemo(() => {
    return (Object.keys(SERVICE_META) as ServiceKey[]).map((key) => {
      const meta = SERVICE_META[key];
      const limit = Number(limits.find((l: any) => l.service_type === key)?.monthly_limit) || meta.defaultLimit;
      const used = usageByService[key] ?? 0;
      const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      return { key, meta, limit, used, pct };
    });
  }, [usageByService, limits]);

  const overSoft = services.filter((s) => s.pct >= SOFT_THRESHOLD * 100);

  return (
    <Card dir="rtl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
              צריכת משאבים
            </CardTitle>
            <CardDescription>
              מעקב חודשי אחר שימוש ב-API. {isDemoMode ? "מציג נתוני דמו." : "מציג נתונים אמיתיים."}
            </CardDescription>
          </div>
          <Badge variant={isDemoMode ? "secondary" : "outline"}>
            {isDemoMode ? "מצב דמו" : "מצב חי"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {overSoft.length > 0 && (
          <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/10 text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <AlertTitle>התראה: התקרבות למגבלה החודשית</AlertTitle>
            <AlertDescription>
              חרגת מ־90% מהמכסה ב־
              {overSoft.map((s, i) => (
                <span key={s.key}>
                  {i > 0 ? ", " : " "}
                  <strong>{s.meta.label}</strong> ({Math.round(s.pct)}%)
                </span>
              ))}
              . שקול לשדרג את המסלול או להעלות את התקרה.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {services.map(({ key, meta, used, limit, pct }) => {
            const Icon = meta.icon;
            const isWarn = pct >= SOFT_THRESHOLD * 100;
            const isMax = pct >= 100;
            return (
              <div
                key={key}
                className="rounded-lg border border-border/60 bg-card p-3 space-y-2"
                aria-label={`${meta.label}: ${formatNumber(used)} מתוך ${formatNumber(limit)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <span className="text-sm font-semibold truncate">{meta.label}</span>
                  </div>
                  <Badge
                    variant={isMax ? "destructive" : isWarn ? "secondary" : "outline"}
                    className={isWarn && !isMax ? "border-amber-500/50 text-amber-700 dark:text-amber-400" : undefined}
                  >
                    {Math.round(pct)}%
                  </Badge>
                </div>
                <Progress
                  value={pct}
                  className={isWarn ? "[&>div]:bg-amber-500" : undefined}
                  aria-label={`התקדמות ${meta.label}`}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatNumber(used)} / {formatNumber(limit)} {meta.unit}
                  </span>
                  {usageLoading && <span>טוען…</span>}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          המגבלה ניתנת להגדרה לכל שירות. הספים מתאפסים בתחילת כל חודש קלנדרי.
        </p>
      </CardContent>
    </Card>
  );
}

export default UsageMeterPanel;
