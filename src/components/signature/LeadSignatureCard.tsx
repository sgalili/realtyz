import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileSignature, Download } from 'lucide-react';
import { toast } from 'sonner';
import { DigitalSignatureButton } from './DigitalSignatureButton';

type Doc = {
  id: string;
  title: string;
  status: string;
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
  signed_pdf_path: string | null;
  pdf_path: string | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'טיוטה', tone: 'bg-muted text-muted-foreground' },
  sent: { label: 'ממתין לחתימה', tone: 'bg-amber-100 text-amber-700' },
  viewed: { label: 'נצפה', tone: 'bg-primary/10 text-primary' },
  signed: { label: 'נחתם', tone: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'פג תוקף', tone: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'בוטל', tone: 'bg-muted text-muted-foreground' },
};

/**
 * Signature status for one contact: send a pre-tour signing link and open the
 * signed PDF that was automatically attached to this contact's record.
 */
export function LeadSignatureCard({
  lead,
  listingId,
}: {
  lead: { id: string; full_name: string | null; phone_number: string } | null;
  listingId?: string | null;
}) {
  const { data: docs = [] } = useQuery({
    queryKey: ['lead-signature-docs', lead?.id],
    enabled: !!lead?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closing_documents')
        .select('id, title, status, signed_at, sent_at, created_at, signed_pdf_path, pdf_path')
        .eq('lead_id', lead!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as Doc[];
    },
  });

  async function openPdf(doc: Doc) {
    const path = doc.signed_pdf_path || doc.pdf_path;
    if (!path) {
      toast.error('אין קובץ זמין למסמך הזה');
      return;
    }
    const { data, error } = await supabase.storage.from('closing-docs').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error('פתיחת המסמך נכשלה');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100 p-3" dir="rtl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <FileSignature className="h-3.5 w-3.5" />
          חתימה דיגיטלית
        </p>
        <DigitalSignatureButton lead={lead} listingId={listingId} label="שליחה לחתימה" />
      </div>
      {docs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          שלחו קישור חתימה לפני הסיור בנכס. המסמך החתום יישמר אוטומטית בכרטיס איש הקשר.
        </p>
      ) : (
        <div className="divide-y rounded-md border bg-background">
          {docs.map((d) => {
            const meta = STATUS_LABEL[d.status] ?? STATUS_LABEL.draft;
            return (
              <div key={d.id} className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.signed_at
                      ? `נחתם ב-${new Date(d.signed_at).toLocaleString('he-IL')}`
                      : d.sent_at
                        ? `נשלח ב-${new Date(d.sent_at).toLocaleString('he-IL')}`
                        : `נוצר ב-${new Date(d.created_at).toLocaleString('he-IL')}`}
                  </p>
                </div>
                <Badge variant="outline" className={`${meta.tone} px-2 py-0 text-[10px]`}>
                  {meta.label}
                </Badge>
                <Button size="icon" variant="ghost" onClick={() => openPdf(d)} title="פתיחת המסמך">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
