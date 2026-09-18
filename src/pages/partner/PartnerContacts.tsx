// Partner-only "אנשי קשר" screen: every contact the partner brought in, with
// activity, submission status, accrued reward and partner-relevant actions.
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageCircle, Phone, Search, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ContactAvatar from '@/components/contacts/ContactAvatar';
import { officialWaLink } from '@/lib/officialWa';
import { fmtILS } from '@/lib/formatCurrency';
import { SUBMISSION_STATUS_LABELS } from '@/hooks/useAffiliate';
import { usePartnerContacts, type PartnerContact } from '@/hooks/usePartnerSurfaces';

const TABS = [
  { value: 'all', label: 'הכל' },
  { value: 'active', label: 'פעילים' },
  { value: 'closed', label: 'נסגרו' },
] as const;

function fmtDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function dealTypeLabel(value: string | null): string | null {
  if (!value) return null;
  return value === 'rent' ? 'שכירות' : value === 'sale' ? 'מכירה' : value;
}

function ContactCard({ contact }: { contact: PartnerContact }) {
  const navigate = useNavigate();
  const status = contact.submission_status
    ? SUBMISSION_STATUS_LABELS[contact.submission_status as keyof typeof SUBMISSION_STATUS_LABELS] ?? contact.submission_status
    : null;
  const earned = Number(contact.earned_amount ?? 0);
  const deal = dealTypeLabel(contact.deal_type);

  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-3">
          <ContactAvatar
            name={contact.full_name ?? undefined}
            imageUrl={contact.profile_picture_url ?? undefined}
            className="h-9 w-9"
          />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[14px] font-medium text-slate-800">
              {contact.full_name || contact.phone_number || 'איש קשר'}
            </p>
            <p className="text-[13px] text-slate-600">
              {[contact.city, contact.neighborhood, deal].filter(Boolean).join(' • ')}
            </p>
          </div>
          {status && (
            <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[12px] text-violet-700 ring-1 ring-violet-200">
              {status}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          <Badge variant="outline" className="text-[12px] font-normal">{contact.message_count} הודעות</Badge>
          {contact.last_interaction_at && <span>פעילות אחרונה: {fmtDate(contact.last_interaction_at)}</span>}
          {earned > 0 && <span className="text-emerald-700">תגמול: {fmtILS(earned)}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="text-[13px]"
            onClick={() => navigate('/partner/chats')}
          >
            <MessageCircle className="me-1 h-4 w-4 text-cyan-700" /> צ׳אט
          </Button>
          {contact.phone_number && (
            <>
              <Button asChild variant="outline" size="sm" className="text-[13px]">
                <a href={`tel:${contact.phone_number}`}>
                  <Phone className="me-1 h-4 w-4 text-emerald-700" /> שיחה
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="text-[13px]">
                <a href={officialWaLink('')} target="_blank" rel="noreferrer">
                  וואטסאפ
                </a>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PartnerContacts() {
  const { data: contacts = [], isLoading } = usePartnerContacts();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      const s = (c.submission_status || '').toLowerCase();
      if (tab === 'closed' && !['deal_signed', 'closed', 'lost', 'rejected'].includes(s)) return false;
      if (tab === 'active' && ['deal_signed', 'closed', 'lost', 'rejected'].includes(s)) return false;
      if (!q) return true;
      return `${c.full_name ?? ''} ${c.phone_number ?? ''} ${c.city ?? ''}`.toLowerCase().includes(q);
    });
  }, [contacts, search, tab]);

  const earnedTotal = contacts.reduce((sum, c) => sum + Number(c.earned_amount ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3" dir="rtl">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-violet-50 p-3 text-center">
          <p className="text-lg font-semibold text-violet-700">{contacts.length}</p>
          <p className="text-[13px] text-slate-600">אנשי קשר</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 text-center">
          <p className="text-lg font-semibold text-emerald-700">{fmtILS(earnedTotal)}</p>
          <p className="text-[13px] text-slate-600">תגמולים</p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש איש קשר"
          className="pe-9 text-[14px]"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-[13px]">{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Users className="h-6 w-6 text-slate-400" />
            <p className="text-[14px] text-slate-600">אין אנשי קשר להצגה כרגע.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">{filtered.map((c) => <ContactCard key={c.lead_id} contact={c} />)}</div>
      )}
    </div>
  );
}
