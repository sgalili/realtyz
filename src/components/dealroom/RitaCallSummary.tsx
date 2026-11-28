import { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, ChevronDown, FileText, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { useRitaCallTranscript, useRitaProfileCalls } from '@/hooks/useRitaCalls';
import { RITA_CALL_ROLE_LABELS, ritaCallDuration, type RitaCallSummaryData } from '@/lib/ritaCallSummary';

export function RitaLatestCallBadge({ summary }: { summary: RitaCallSummaryData | null }) {
  if (!summary) return null;
  const Icon = summary.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
  return <span className="inline-flex items-center gap-1 text-xs text-primary" title={`${new Date(summary.started_at).toLocaleString('he-IL')} · ${RITA_CALL_ROLE_LABELS[summary.call_role]}`}>
    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
    שיחת ריטה · {new Date(summary.started_at).toLocaleDateString('he-IL')}
  </span>;
}

export function RitaQualificationTags({ summary }: { summary: RitaCallSummaryData }) {
  const q = summary.qualification;
  const tags = [
    ['תקציב', q.budget_financing], ['לוח זמנים', q.timeline_urgency], ['גמישות אזורית', q.area_flexibility],
    ['זמינות לצפייה', q.viewing_availability], ['השלב הבא', q.next_step],
    ['נכסים שהוצעו', summary.matched_property_ids.length ? `${summary.matched_property_ids.length}` : null],
  ];
  return <div className="flex min-w-0 flex-wrap gap-1.5">{tags.map(([label, value]) => value ?
    <Badge key={label} variant="secondary" className="max-w-full whitespace-normal break-words [overflow-wrap:anywhere] text-xs font-normal"><span className="font-semibold">{label}:&nbsp;</span>{value}</Badge> : null)}</div>;
}

export function RitaCallSummary({ summary, compact = false }: { summary: RitaCallSummaryData; compact?: boolean }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcript = useRitaCallTranscript(summary.call_record_id ?? null, transcriptOpen);
  const Icon = summary.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
  return <section dir="rtl" aria-label="סיכום שיחה ותובנות (ריטה)" className="min-w-0 space-y-2 border-t border-border pt-3 text-right" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />סיכום שיחה ותובנות (ריטה)</h3>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <time dateTime={summary.started_at}>{new Date(summary.started_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</time>
      <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" aria-hidden />{summary.direction === 'inbound' ? 'נכנסת' : 'יוצאת'}</span>
      <span dir="ltr">{ritaCallDuration(summary.duration_seconds)}</span>
      <span title={summary.call_role}>{RITA_CALL_ROLE_LABELS[summary.call_role]}</span>
    </div>
    {summary.bullets.length > 0 ? <ul className="list-inside list-disc space-y-1 break-words [overflow-wrap:anywhere] text-sm leading-relaxed">{summary.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul> : <p className="text-xs text-muted-foreground">לא התקבל סיכום שיחה</p>}
    <RitaQualificationTags summary={summary} />
    {!compact && summary.call_record_id && <>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-0 text-xs" aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen(open => !open)}>
        <FileText className="h-3.5 w-3.5" aria-hidden />{transcriptOpen ? 'סגירת התמלול' : 'תמלול מלא'}<ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${transcriptOpen ? 'rotate-180' : ''}`} aria-hidden />
      </Button>
      <AnimatedExpansion open={transcriptOpen}>
        {transcriptOpen && <div className="max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words border-s-2 border-border ps-3 text-sm leading-relaxed text-muted-foreground">
          {transcript.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-label="טוען תמלול" /> : transcript.isError ? <p role="alert">לא ניתן לטעון את התמלול כרגע</p> : transcript.data || 'אין תמלול זמין בהרשאות שלך'}
        </div>}
      </AnimatedExpansion>
    </>}
  </section>;
}

/** All user/broker cards share one RLS-filtered latest-call query, never a query per row. */
export function RitaProfileCall({ userId }: { userId: string }) {
  const calls = useRitaProfileCalls();
  const summary = calls.data?.[userId];
  return summary ? <RitaCallSummary key={summary.conversation_id} summary={summary} /> : null;
}