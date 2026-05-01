import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Run = {
  id: string;
  trigger_type: string;
  action_type: string;
  status: string;
  summary: string | null;
  error: string | null;
  created_at: string;
  lead_id: string | null;
  payload: any;
};

const TRIGGER_LABEL: Record<string, string> = {
  lead_added: 'New lead',
  meeting_booked: 'Meeting booked',
  followup_after_hours: '48h follow-up',
  birthday_anniversary: 'Birthday/Anniversary',
  lead_stage_changed: 'Stage changed',
};

const ACTION_LABEL: Record<string, string> = {
  send_whatsapp: 'WhatsApp sent',
  create_note: 'Note created',
  notify_agent: 'Agent notified',
  composite: 'Multi-step run',
};

export function AutomationActivityFeed({ leadId, limit = 25 }: { leadId?: string | null; limit?: number }) {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['automation-runs', leadId ?? 'all'],
    queryFn: async () => {
      const q = supabase
        .from('automation_runs')
        .select('id, trigger_type, action_type, status, summary, error, created_at, lead_id, payload')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (leadId) q.eq('lead_id', leadId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Run[];
    },
    refetchInterval: 15_000,
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Automation Activity</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">Live</Badge>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !runs?.length ? (
        <p className="text-xs text-muted-foreground">No automated actions yet.</p>
      ) : (
        <ScrollArea className="max-h-72 pr-2">
          <ul className="space-y-2">
            {runs.map((r) => {
              const Icon =
                r.status === 'success' ? CheckCircle2 :
                r.status === 'failed' ? AlertCircle : Clock;
              const tone =
                r.status === 'success' ? 'text-success' :
                r.status === 'failed' ? 'text-destructive' : 'text-muted-foreground';
              return (
                <li key={r.id} className="flex items-start gap-2 text-xs border-l-2 border-border pl-2">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${tone}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{TRIGGER_LABEL[r.trigger_type] || r.trigger_type}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{ACTION_LABEL[r.action_type] || r.action_type}</span>
                    </div>
                    <p className="text-muted-foreground truncate">
                      {r.summary || r.error || '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </Card>
  );
}
