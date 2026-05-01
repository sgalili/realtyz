import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { AlertOctagon, AlertTriangle, Clock4 } from 'lucide-react';

interface ErrorLogRow {
  id: string;
  created_at: string;
  source: string;
  message: string;
  user_email: string | null;
  url: string | null;
  severity: string;
  context: Record<string, unknown> | null;
}

const severityMeta: Record<string, { label: string; cls: string; Icon: typeof AlertOctagon }> = {
  error: { label: 'שגיאה', cls: 'bg-red-500/15 text-red-600 border-red-500/30', Icon: AlertOctagon },
  timeout: { label: 'Timeout', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30', Icon: Clock4 },
  warning: { label: 'אזהרה', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30', Icon: AlertTriangle },
};

export const ErrorLogPanel = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-error-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_logs' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ErrorLogRow[];
    },
    refetchInterval: 30_000,
  });

  const timeoutCount = (data ?? []).filter((r) => r.severity === 'timeout').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-red-500" />
            יומן שגיאות (Error Log)
          </CardTitle>
          <CardDescription className="text-xs">
            100 השגיאות האחרונות מצד הלקוח – כולל API timeouts ושגיאות רינדור.
          </CardDescription>
        </div>
        {timeoutCount > 0 && (
          <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
            {timeoutCount} timeouts
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>זמן</TableHead>
                <TableHead>חומרה</TableHead>
                <TableHead>מקור</TableHead>
                <TableHead>הודעה</TableHead>
                <TableHead>משתמש</TableHead>
                <TableHead>נתיב</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((row) => {
                const meta = severityMeta[row.severity] ?? severityMeta.error;
                const Icon = meta.Icon;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.created_at), 'dd/MM HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.source}</TableCell>
                    <TableCell className="text-xs max-w-md truncate" title={row.message}>
                      {row.message}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {row.user_email ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {row.url ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!data || data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    אין שגיאות מתועדות 🎉
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ErrorLogPanel;
