import { Loader2 } from 'lucide-react';
import { useRitaLeadCalls } from '@/hooks/useRitaCalls';
import { parseRitaCallSummary, ritaSummaryBullets, type RitaCallSummaryData } from '@/lib/ritaCallSummary';
import { RitaCallSummary } from './RitaCallSummary';

export function CallHistoryList({ leadId, limit = 5, latest = null }: { leadId: string; limit?: number; latest?: RitaCallSummaryData | null }) {
  const calls = useRitaLeadCalls(leadId, limit);
  if (calls.isError && !latest) return <p role="alert" className="text-sm text-muted-foreground">לא ניתן לטעון את השיחות כרגע</p>;
  if (calls.isLoading && !latest) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="טוען שיחות" />;
  const summaries = (calls.data ?? []).map(row => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
    const stored = parseRitaCallSummary(metadata['rita_summary']);
    if (stored) return stored;
    // Preserve historical/manual call history; do not invent qualification.
    return parseRitaCallSummary({
      conversation_id: row.id, call_record_id: row.id, started_at: row.started_at,
      direction: row.direction, duration_seconds: row.duration_seconds ?? 0,
      call_role: metadata['call_role'] || 'general_inbound', bullets: ritaSummaryBullets(null, row.summary),
      qualification: { budget_financing: null, timeline_urgency: null, area_flexibility: null, viewing_availability: null, next_step: row.callback_reason, requested_callback: !!row.needs_callback },
      matched_property_ids: [],
    });
  }).filter((summary): summary is RitaCallSummaryData => !!summary);
  if (latest && !summaries.some(summary => summary.conversation_id === latest.conversation_id)) summaries.unshift(latest);
  if (!summaries.length) return null;
  return <div className="space-y-3">{summaries.map(summary => <RitaCallSummary key={summary.conversation_id} summary={summary} />)}</div>;
}
