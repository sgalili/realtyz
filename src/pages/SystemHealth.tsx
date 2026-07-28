import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldAlert, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';

type Settings = {
  alert_email: string | null;
  alert_whatsapp_phone: string | null;
  alert_cooldown_minutes: number;
  monitored_integrations: string[];
};

type ErrorLog = {
  id: string;
  integration: string;
  function_name: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

/** Hebrew labels for the error categories emitted by the WhatsApp gateway. */
const ERROR_CATEGORY_LABEL: Record<string, string> = {
  permission_scope: 'הרשאות טוקן חסרות',
  token_expired: 'טוקן פג תוקף',
  token_invalid: 'טוקן לא תקף',
  config: 'שגיאת הגדרות',
  template: 'תבנית לא תקינה',
  session_window: 'חלון 24 שעות',
  recipient: 'בעיית נמען',
  rate_limit: 'חריגת מכסה',
  account_suspended: 'חשבון מושהה',
  network: 'תקלת רשת',
  unknown: 'שגיאה כללית',
};

const AUTH_CATEGORIES = new Set(['permission_scope', 'token_expired', 'token_invalid']);

function parseErrorCode(code: string | null): { category: string | null; label: string | null; isAuth: boolean } {
  if (!code) return { category: null, label: null, isAuth: false };
  const category = code.split(':')[0];
  return {
    category,
    label: ERROR_CATEGORY_LABEL[category] ?? code,
    isAuth: AUTH_CATEGORIES.has(category),
  };
}


const INTEGRATION_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  homely: 'Homely',
  transcription: 'תמלול',
  ai_gateway: 'AI Gateway',
  email_queue: 'תור דוא״ל',
};

export default function SystemHealth() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['system-health-settings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('system_health_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Settings | null;
    },
  });

  const { data: status } = useQuery({
    queryKey: ['system-status-page'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_system_status');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: logs } = useQuery({
    queryKey: ['integration-error-logs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('integration_error_logs')
        .select('id, integration, function_name, error_code, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ErrorLog[];
    },
    refetchInterval: 60_000,
  });

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cooldown, setCooldown] = useState(30);
  useEffect(() => {
    if (settings) {
      setEmail(settings.alert_email ?? '');
      setPhone(settings.alert_whatsapp_phone ?? '');
      setCooldown(settings.alert_cooldown_minutes ?? 30);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const normalizedPhone = phone.replace(/\D/g, '');
      const { error } = await (supabase as any)
        .from('system_health_settings')
        .update({
          alert_email: email.trim() || null,
          alert_whatsapp_phone: normalizedPhone || null,
          alert_cooldown_minutes: cooldown,
        })
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הגדרות התראה נשמרו');
      qc.invalidateQueries({ queryKey: ['system-health-settings'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'שמירה נכשלה'),
  });

  return (
    <AppLayout>
      <div dir="rtl" className="mx-auto max-w-5xl space-y-6 py-6 text-right">
        <header className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">בריאות המערכת</h1>
            <p className="text-sm text-muted-foreground">
              מעקב אחר אינטגרציות חיצוניות והתראות חירום
            </p>
          </div>
        </header>

        {/* Live status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> סטטוס חי
            </CardTitle>
            <CardDescription>חלון של 5 הדקות האחרונות</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(status ?? []).map((r: any) => (
                <div
                  key={r.integration}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {INTEGRATION_LABEL[r.integration] ?? r.integration}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.recent_failures} כשלים ב-5 דקות
                    </p>
                  </div>
                  {r.status === 'operational' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">
                      <CheckCircle2 className="me-1 h-3 w-3" /> תקין
                    </Badge>
                  ) : r.status === 'warning' ? (
                    <Badge className="bg-amber-400/20 text-amber-700 hover:bg-amber-400/20">
                      <AlertTriangle className="me-1 h-3 w-3" /> אזהרה
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertTriangle className="me-1 h-3 w-3" /> תקלה
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alert config */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">יעדי התראה</CardTitle>
            <CardDescription>
              נשלחים כאשר אינטגרציה צוברת 3 כשלים או יותר ב-5 דקות
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="alert-email">דוא״ל לקבלת התראות</Label>
              <Input
                id="alert-email"
                type="email"
                dir="ltr"
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="alert-phone">מספר WhatsApp לקבלת התראות</Label>
              <Input
                id="alert-phone"
                dir="ltr"
                placeholder="9725XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                פורמט בינלאומי ללא + (לדוגמה: 972501234567)
              </p>
            </div>
            <div>
              <Label htmlFor="cooldown">צינון בין התראות (דקות)</Label>
              <Input
                id="cooldown"
                type="number"
                min={5}
                max={1440}
                value={cooldown}
                onChange={(e) => setCooldown(Number(e.target.value))}
              />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              שמור הגדרות
            </Button>
          </CardContent>
        </Card>

        {/* Error log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">לוג כשלים אחרון</CardTitle>
            <CardDescription>50 הרשומות האחרונות</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-right">
                  <tr>
                    <th className="px-3 py-2 font-medium">זמן</th>
                    <th className="px-3 py-2 font-medium">אינטגרציה</th>
                    <th className="px-3 py-2 font-medium">פונקציה</th>
                    <th className="px-3 py-2 font-medium">סוג</th>
                    <th className="px-3 py-2 font-medium">שגיאה</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs ?? []).map((l) => {
                    const cat = parseErrorCode(l.error_code);
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {new Date(l.created_at).toLocaleString('he-IL')}
                        </td>
                        <td className="px-3 py-2">
                          {INTEGRATION_LABEL[l.integration] ?? l.integration}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {l.function_name ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {cat.label ? (
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] ${
                                cat.isAuth
                                  ? 'bg-destructive/10 text-destructive'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {cat.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 ${cat.isAuth ? 'text-destructive' : 'text-foreground/80'}`}>
                          <span className="line-clamp-2">{l.error_message ?? '-'}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {(!logs || logs.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        אין כשלים מתועדים
                      </td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
