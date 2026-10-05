import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';

type Row = {
  id: string; listing_label: string; tier: number; gross: number; price: number;
  lead_name: string | null; lead_phone: string | null; created_at: string; purchased_at: string | null;
};

const TIER = ['', 'טופס', 'WhatsApp', 'שיחה'];
const fmt = (d: string) => new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Contacts that arrived after a property's daily limit: optional, bought at the partner's discounted price. */
export default function LeftoverLeadsDialog() {
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const qc = useQueryClient();
  const { workspaceOwnerId } = useWorkspace() as { workspaceOwnerId?: string | null };
  const key = ['leftover-leads', workspaceOwnerId ?? 'none'];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('list_leftover_leads');
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const pending = rows.filter((r) => !r.purchased_at).length;

  const buy = async (id: string) => {
    setBuying(id);
    const { data, error } = await (supabase.rpc as any)('purchase_leftover_lead', { _charge_id: id });
    setBuying(null);
    if (error || !data?.ok) { toast.error('הרכישה נכשלה'); return; }
    toast.success('איש הקשר נרכש');
    qc.invalidateQueries({ queryKey: key });
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-[44px] shrink-0 gap-1.5" onClick={() => setOpen(true)} title="אנשי קשר מעבר למכסה היומית">
        <Inbox className="h-4 w-4" />
        {pending > 0 ? <span className="font-semibold">{pending}</span> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>אנשי קשר מעבר למכסה היומית</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">אנשי קשר שהגיעו אחרי שהנכס הגיע למכסה. לא חויבתם עליהם; ניתן לרכוש במחיר המוזל שקבע השותף.</p>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">אין כרגע אנשי קשר נוספים</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">נכס</th><th className="p-2 text-start">איש קשר</th><th className="p-2 text-start">סוג</th><th className="p-2 text-start">מחיר</th><th className="p-2" /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="max-w-[160px] truncate p-2" title={r.listing_label}>{r.listing_label}<div className="text-xs text-muted-foreground">{fmt(r.created_at)}</div></td>
                      <td className="p-2">{r.lead_name || '—'}<div dir="ltr" className="text-end text-xs text-muted-foreground">{r.lead_phone || ''}</div></td>
                      <td className="p-2">{TIER[r.tier] ?? r.tier}</td>
                      <td className="p-2 whitespace-nowrap">
                        ₪{Number(r.price).toLocaleString('he-IL')}
                        {Number(r.gross) > Number(r.price) ? <span className="ms-1 text-xs text-muted-foreground line-through">₪{Number(r.gross).toLocaleString('he-IL')}</span> : null}
                      </td>
                      <td className="p-2 text-end">
                        {r.purchased_at ? <span className="text-xs text-muted-foreground">נרכש</span> : (
                          <Button size="sm" disabled={buying === r.id} onClick={() => buy(r.id)}>
                            {buying === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'רכישה'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
