import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Phone, AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CallRow {
  id: string;
  started_at: string;
  duration_seconds: number;
  caller_phone: string | null;
  status: string;
  handled_by: string;
  needs_callback: boolean;
  callback_reason: string | null;
  summary: string | null;
  transcript_text: string | null;
}

export function CallHistoryList({ leadId, limit = 5 }: { leadId: string; limit?: number }) {
  const [rows, setRows] = useState<CallRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase
        .from('call_records')
        .select('id, started_at, duration_seconds, caller_phone, status, handled_by, needs_callback, callback_reason, summary, transcript_text')
        .eq('lead_id', leadId)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (on) setRows((data as CallRow[]) || []);
    })();
    return () => { on = false; };
  }, [leadId, limit]);

  if (rows === null) return <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Loading calls…</div>;
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Phone className="h-4 w-4 text-primary" />
        Call history ({rows.length})
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const mins = Math.max(1, Math.round(r.duration_seconds / 60));
          const isOpen = expanded === r.id;
          return (
            <li key={r.id} className="rounded border bg-background p-2 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{new Date(r.started_at).toLocaleString()}</span>
                  <Badge variant="outline" className="text-[10px]">{r.handled_by === 'ai' ? 'AI' : 'Agent'} · {mins}m</Badge>
                  {r.needs_callback && (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <AlertTriangle className="h-3 w-3" /> Callback
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  {isOpen ? 'Hide' : 'Open'}
                </button>
              </div>
              {r.summary && <p className="text-muted-foreground line-clamp-2">{r.summary}</p>}
              {isOpen && (
                <div className="space-y-1 pt-1 border-t">
                  {r.callback_reason && (
                    <p className="text-destructive"><strong>Callback reason:</strong> {r.callback_reason}</p>
                  )}
                  {r.transcript_text && (
                    <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted-foreground max-h-64 overflow-auto">
                      {r.transcript_text}
                    </pre>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
