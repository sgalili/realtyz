import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export function BulkBrokerWhatsAppScan() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const scan = async () => {
    if (busy) return;
    setBusy(true);
    let after: string | undefined;
    let queued = 0;
    let skipped = 0;
    try {
      do {
        const { data, error } = await supabase.functions.invoke('broker-whatsapp-worker', { body: { action: 'enqueue_missing', ...(after ? { after } : {}) } });
        if (error) throw error;
        queued += data.results.filter((r: { status: string }) => r.status === 'queued').length;
        skipped += data.results.filter((r: { status: string }) => r.status === 'skipped').length;
        after = data.next ?? undefined;
      } while (after);
      toast.success(`${queued} מתווכים בתור הגילוי${skipped ? ` · ${skipped} חשבונות ללא מקור מתאים או שאינם מתווכים` : ''}`);
    } catch { toast.error(`הוספת המשימות נעצרה; ${queued} משימות שכבר נשמרו ימשיכו בתור`); }
    finally { setBusy(false); void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job'] }); }
  };
  return <div className="flex justify-start"><Button variant="ghost" className="text-lead-whatsapp" disabled={busy} aria-busy={busy} onClick={() => void scan()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}איתור WhatsApp לכל המתווכים</Button></div>;
}