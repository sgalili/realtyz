/**
 * SignatureStatusStrip
 * --------------------
 * Compact monitoring strip for digital signature forms that were sent to a
 * contact: shows every form with its exact live status (sent / viewed /
 * signed / expired) so the broker can track it without opening the contact.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { FileSignature } from 'lucide-react';

type Doc = {
  id: string;
  title: string;
  status: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'טיוטה', tone: 'bg-muted text-muted-foreground border-border' },
  sent: { label: 'ממתין לחתימה', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  viewed: { label: 'נצפה', tone: 'bg-primary/10 text-primary border-primary/20' },
  signed: { label: 'נחתם', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  expired: { label: 'פג תוקף', tone: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelled: { label: 'בוטל', tone: 'bg-muted text-muted-foreground border-border' },
};

function when(d: Doc) {
  const iso = d.signed_at ?? d.viewed_at ?? d.sent_at ?? d.created_at;
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SignatureStatusStrip({
  leadId,
  listingId,
  limit = 3,
}: {
  leadId: string | null | undefined;
  listingId?: string | null;
  limit?: number;
}) {
  const { data: docs = [] } = useQuery({
    queryKey: ['signature-status-strip', leadId, listingId ?? null, limit],
    enabled: !!leadId,
    // Live monitoring: the client signs outside the app, so poll periodically.
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('closing_documents')
        .select('id, title, status, sent_at, viewed_at, signed_at, created_at')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (listingId) q = q.eq('listing_id', listingId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  if (!leadId || docs.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 rounded-md border bg-background/70 p-2" dir="rtl">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
        <FileSignature className="h-3.5 w-3.5" />
        טפסים לחתימה דיגיטלית
      </p>
      {docs.map((d) => {
        const meta = STATUS_LABEL[d.status] ?? STATUS_LABEL.draft;
        return (
          <div key={d.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px]">{d.title}</span>
            <span className="text-[11px] text-muted-foreground">{when(d)}</span>
            <Badge variant="outline" className={`${meta.tone} px-2 py-0 text-[11px]`}>
              {meta.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export default SignatureStatusStrip;
