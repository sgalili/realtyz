import { useState } from 'react';
import { Send } from 'lucide-react';
import { useMySubmissions, SUBMISSION_STATUS_LABELS, SETTLEMENT_LABELS } from '@/hooks/useAffiliate';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtCredits, ilsToCredits } from '@/lib/credits';

export default function SentPartnerLeads() {
  const { data: submissions = [], isLoading, isError, refetch } = useMySubmissions();
  const { level4Unlocked } = useAffiliateLicense();
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const filtered = submissions.filter((row) =>
    [row.lead_name, row.lead_phone, row.listing?.property_title, row.listing?.address, row.listing?.city]
      .filter(Boolean).join(' ').toLowerCase().includes(query),
  );

  return <div className="space-y-3" dir="rtl">
    <Input aria-label="חיפוש בלידים שנשלחו" placeholder="חיפוש ליד" value={search} onChange={(event) => setSearch(event.target.value)} />
    {isLoading ? <Skeleton className="h-24 w-full" /> : isError ?
      <div role="alert" className="space-y-2 py-8 text-center text-muted-foreground">
        <p>לא ניתן לטעון את הלידים שנשלחו.</p>
        <Button variant="outline" onClick={() => refetch()}>נסה שוב</Button>
      </div> : filtered.length === 0 ?
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <Send className="h-6 w-6" /><p>אין לידים שנשלחו להצגה.</p>
      </div> : <div className="space-y-2">{filtered.map((row) => {
        const status = !level4Unlocked && row.status === 'closed' ? 'verified' : row.status;
        const reward = Number(row.partner_net_amount ?? 0);
        return <article key={row.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words font-semibold text-foreground">{row.lead_name || 'ליד'}</p>
              {row.listing && <p className="break-words text-sm text-muted-foreground">{row.listing.property_title || row.listing.address}</p>}
            </div>
            <Badge variant="secondary">{SUBMISSION_STATUS_LABELS[status] ?? 'הוגש'}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString('he-IL')}</time>
            {row.settlement_status && <span>{SETTLEMENT_LABELS[row.settlement_status]}</span>}
            {reward > 0 && <span className="font-semibold text-success">{fmtCredits(ilsToCredits(reward))}</span>}
          </div>
        </article>;
      })}</div>}
  </div>;
}