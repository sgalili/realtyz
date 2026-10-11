import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Search, Clock, User, Database } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import TotpSetup from '@/components/security/TotpSetup';

const ACTION_LABELS: Record<string, string> = {
  bulk_status_update: 'עדכון סטטוס מרוכז',
  bulk_interest_update: 'עדכון תגית מרוכז',
  voter_export: 'ייצוא לידים',
  voter_import: 'ייבוא לידים',
  ai_tone_change: 'שינוי טון AI',
  campaign_settings_save: 'שמירת הגדרות קמפיין',
  voter_add: 'הוספת ליד',
  login: 'כניסה למערכת',
  logout: 'יציאה מהמערכת',
};

export default function SecurityDashboard() {
  const [search, setSearch] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  const filteredLogs = (logs ?? []).filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (log.action?.toLowerCase().includes(s)) ||
      (log.actor_email?.toLowerCase().includes(s)) ||
      (log.target_table?.toLowerCase().includes(s)) ||
      (ACTION_LABELS[log.action]?.includes(search))
    );
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">אבטחה ומעקב</h1>
        <p className="text-muted-foreground text-sm mt-1">יומן פעולות, 2FA, וניהול אבטחה</p>
      </div>

      {/* TOTP 2FA Section */}
      <TotpSetup />

      {/* Audit Logs */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              יומן פעולות
            </CardTitle>
            <div className="relative w-60">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="חפש פעולה..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'לא נמצאו תוצאות' : 'אין פעולות מתועדות עדיין'}
            </p>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5">
                          {log.action}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {log.actor_email || 'משתמש לא ידוע'}
                        {log.target_table && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <Database className="h-3 w-3" />
                            {log.target_table}
                            {log.target_id && ` #${log.target_id.slice(0, 8)}`}
                          </span>
                        )}
                      </p>
                      {log.details && Object.keys(log.details as object).length > 0 && (
                        <p className="text-xs text-muted-foreground/70 mt-1 font-mono" dir="ltr">
                          {JSON.stringify(log.details).slice(0, 120)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(parseISO(log.created_at), 'dd/MM HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
