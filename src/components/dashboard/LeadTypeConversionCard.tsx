import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';

const ROWS = {
  form: { label: 'פנייה דרך טופס בעמוד נחיתה', Icon: ClipboardList, tone: 'text-lead-form' },
  whatsapp: { label: 'פנייה מסוננת בוואטסאפ עם ריטה AI', Icon: WhatsAppIcon, tone: 'text-lead-whatsapp' },
  phone: { label: 'פנייה מסוננת טלפונית עם ריטה AI', Icon: Phone, tone: 'text-lead-phone' },
} as const;

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

export function LeadTypeConversionCard({ days }: { days: number }) {
  const owner = useActiveWorkspaceOwnerId();
  const { data, isLoading } = useQuery({
    queryKey: ['lead-type-conversion', owner, days],
    enabled: !!owner,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_lead_type_conversion', { _owner: owner!, _days: days });
      if (error) throw error;
      return data ?? [];
    },
  });
  return <Card dir="rtl">
    <CardHeader><CardTitle className="text-base">אילו סוגי פניות סוגרים עסקאות</CardTitle></CardHeader>
    <CardContent>
      {isLoading ? <p className="text-sm text-muted-foreground">טוען...</p> : <table className="w-full text-sm">
        <thead><tr className="text-muted-foreground"><th className="text-start font-normal">סוג פנייה</th><th className="font-normal">לחיצות</th><th className="font-normal">לידים</th><th className="font-normal">עסקאות</th><th className="font-normal">המרה</th></tr></thead>
        <tbody>{data?.map(r => { const row = ROWS[r.lead_type as keyof typeof ROWS]; if (!row) return null; const { Icon } = row; return <tr key={r.lead_type} className="border-t">
          <td className="py-2"><span className={`inline-flex items-center gap-2 ${row.tone}`}><Icon className="h-4 w-4 shrink-0" /><span className="text-foreground">{row.label}</span></span></td>
          <td className="text-center">{Number(r.clicks)}</td><td className="text-center">{Number(r.leads)}</td><td className="text-center font-semibold">{Number(r.closed)}</td><td className="text-center">{pct(Number(r.closed), Number(r.leads))}</td>
        </tr>; })}</tbody>
      </table>}
    </CardContent>
  </Card>;
}
export default LeadTypeConversionCard;
