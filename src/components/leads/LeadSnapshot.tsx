import { Bot, CircleDot, MessageSquareText, PhoneCall, Search, Signpost, type LucideIcon } from 'lucide-react';

type ChatLine = { role?: string | null; content?: string | null; message?: string | null };
type Msg = { direction?: string | null; sender_type?: string | null; content?: string | null; created_at?: string | null };

const SOURCE: Record<string, string> = { whatsapp: 'וואטסאפ', facebook: 'פייסבוק', instagram: 'אינסטגרם', homely: 'הומלי', yad2: 'יד2', email: 'אימייל', sms: 'SMS', form: 'טופס פנייה', phone: 'שיחת טלפון', manual: 'הוספה ידנית', import: 'ייבוא' };
const STATUS: Record<string, string> = { cold: 'ליד קר', lead: 'ליד קר', contacted: 'נוצר קשר', qualified: 'ליד מוסמך', active: 'ליד מוסמך', negotiation: 'במשא ומתן', closed: 'נסגר', supporter: 'נסגר', voted: 'נסגר', inactive: 'לא רלוונטי' };

function sourceOf(lead: any): string {
  const p = lead?.preferences ?? {};
  const raw = String(p.source || lead?.source || lead?.channel || lead?.platform || '').toLowerCase();
  const hit = Object.keys(SOURCE).find((k) => raw.includes(k));
  return hit ? SOURCE[hit]! : raw ? raw : 'לא ידוע';
}

/** One-glance summary at the top of the lead sheet, from data already loaded for the lead. */
export function LeadSnapshot({ lead, chat, messages }: { lead: any; chat?: ChatLine[] | null; messages?: Msg[] | null }) {
  const p = lead?.preferences ?? {};
  const chatRows = chat ?? [];
  const msgRows = messages ?? [];
  const ritaHandled = !!lead?.ai_autopilot || chatRows.some((m) => m.role === 'assistant') || msgRows.some((m) => m.sender_type === 'ai');
  const status = String(lead?.status ?? '');
  const outcome = String(lead?.interaction_outcome ?? '');
  const closed = ['closed', 'supporter', 'voted', 'inactive'].includes(status) || ['won', 'lost', 'closed_won', 'closed_lost'].includes(outcome);
  const lastInbound = [...msgRows].reverse().find((m) => m.direction !== 'outbound');
  const lastAny = msgRows[msgRows.length - 1];
  const followUp = !closed && (!!p.callback_requested || !!lead?.next_follow_up_at || (!!lastInbound && lastAny === lastInbound));
  const looking = [
    lead?.deal_type === 'rent' ? 'שכירות' : lead?.deal_type === 'sale' ? 'קנייה' : null,
    p.property_type, p.rooms ? `${p.rooms} חדרים` : null, lead?.city || p.city,
    p.budget ? `עד ₪${Number(p.budget).toLocaleString('he-IL')}` : null,
  ].filter(Boolean).join(' · ') || lead?.interest_tag || 'עדיין לא ידוע';
  const highlights = chatRows.filter((m) => m.role === 'user').map((m) => String(m.content ?? m.message ?? '').trim()).filter(Boolean).slice(-3);

  const rows: { icon: LucideIcon; label: string; value: string; tone?: string }[] = [
    { icon: Signpost, label: 'מקור', value: sourceOf(lead) },
    { icon: Bot, label: 'ריטה', value: ritaHandled ? 'טיפלה בליד' : 'עוד לא טיפלה', tone: ritaHandled ? 'text-success' : 'text-muted-foreground' },
    { icon: CircleDot, label: 'סטטוס פנייה', value: STATUS[status] ?? (status || 'חדש') },
    { icon: PhoneCall, label: 'חזרה ללקוח', value: followUp ? 'נדרשת' : 'לא נדרשת כרגע', tone: followUp ? 'text-destructive' : 'text-muted-foreground' },
    { icon: Search, label: 'מחפש', value: looking },
  ];

  return (
    <section dir="rtl" className="mb-4 rounded-xl border border-border bg-muted/30 p-3" aria-label="תמונת מצב של הליד">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">תמונת מצב</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${closed ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'}`}>{closed ? 'סגור' : 'פתוח'}</span>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="flex min-w-0 items-center gap-2 text-sm">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <dt className="shrink-0 text-muted-foreground">{label}:</dt>
            <dd className={`min-w-0 truncate font-medium ${tone ?? ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.75} />עיקרי השיחה</p>
        {highlights.length ? (
          <ul className="space-y-1 text-sm">{highlights.map((h, i) => <li key={i} className="line-clamp-2">“{h}”</li>)}</ul>
        ) : <p className="text-sm text-muted-foreground">אין עדיין שיחה עם הליד</p>}
      </div>
    </section>
  );
}
