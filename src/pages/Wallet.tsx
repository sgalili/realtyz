import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownLeft, CreditCard, Plus, Wallet as WalletIcon } from 'lucide-react';
import { ACTION_META, fmtCompactCredits, fmtCredits, ilsToCredits, parseActionNote } from '@/lib/credits';
import { supabase } from '@/integrations/supabase/client';
import { useCreditWallet } from '@/hooks/useSubscription';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SaveCardForm } from '@/components/billing/SaveCardForm';
import { ZCreditSettingsCard } from '@/components/billing/ZCreditSettingsCard';
import { useUserRole } from '@/hooks/useUserRole';

type LedgerRow = {
  id: string; amount_ils: number; type: string; note: string | null; created_at: string; reference_id: string | null;
  tier: number | null; gross: number | null; extra_fee: number | null; dispute_status: string | null;
  listing_id: string | null; listing_title: string | null; listing_city: string | null; lead_name: string | null;
};
type Card = { id: string; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; status: string; auto_recharge_enabled: boolean; recharge_amount: number; last_charge_error: string | null };

const TYPE_LABEL: Record<string, string> = {
  topup: 'הפקדה', launch_bonus: 'בונוס הצטרפות', referral_reward: 'תגמול הפניה', manual_adjustment: 'התאמה ידנית',
  usage_deduction: 'שימוש בשירותים', affiliate_lead_charge: 'תשלום על פנייה', affiliate_lead_reward: 'תגמול שותף על פנייה',
  dispute_refund: 'החזר מחלוקת', action_charge: 'שימוש בפעולה',
};
const TIER_LABEL: Record<number, string> = { 1: 'טופס', 2: 'וואטסאפ עם ריטה', 3: 'שיחת טלפון' };
const DEPOSIT_TYPES = new Set(['topup', 'launch_bonus', 'referral_reward', 'manual_adjustment', 'dispute_refund']);
export const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const money = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 })}`;
const when = (d: string) => new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Wallet() {
  const ws = useActiveWorkspaceOwnerId();
  const { isSuperAdmin } = useUserRole();
  const { data: wallet } = useCreditWallet();
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const { data: ledger = [] } = useQuery({
    queryKey: ['wallet-ledger', ws], enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_wallet_ledger' as any, { _limit: 500 });
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
  });
  const { data: cards = [] } = useQuery({
    queryKey: ['payment-methods', ws], enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('payment_methods')
        .select('id, brand, last4, exp_month, exp_year, status, auto_recharge_enabled, recharge_amount, last_charge_error')
        .eq('workspace_owner_id', ws).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Card[];
    },
  });

  const deposits = useMemo(() => ledger.filter((r) => r.amount_ils > 0 && DEPOSIT_TYPES.has(r.type)), [ledger]);
  const payments = useMemo(() => ledger.filter((r) => r.amount_ils < 0 || !DEPOSIT_TYPES.has(r.type)), [ledger]);
  const locked = !!wallet?.lockedAt;

  const target = (r: LedgerRow) => [r.listing_title, r.listing_city].filter(Boolean).join(' · ') || r.lead_name || '—';
  const purpose = (r: LedgerRow) => {
    const a = parseActionNote(r.note);
    if (r.type === 'action_charge' && a) return a.quantity !== 1 ? `${a.label} × ${a.quantity}` : a.label;
    return r.tier ? `${TYPE_LABEL[r.type] ?? r.type} · ${TIER_LABEL[r.tier]}` : TYPE_LABEL[r.type] ?? r.note ?? r.type;
  };
  const iconFor = (r: LedgerRow) => {
    const a = parseActionNote(r.note);
    const m = a ? ACTION_META[a.key] : null;
    if (m) return <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.tone}`}><m.icon className="h-3.5 w-3.5" /></span>;
    return <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${r.amount_ils > 0 ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{r.amount_ils > 0 ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}</span>;
  };

  const statusOf = (r: LedgerRow) => ({ open: 'במחלוקת', pending: 'במחלוקת', accepted: 'הוחזר', refunded: 'הוחזר', rejected: 'הושלם' } as Record<string, string>)[r.dispute_status ?? ''] ?? 'הושלם';
  const rows = (list: LedgerRow[], withTarget: boolean) => (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow>
          <TableHead>מועד</TableHead>{withTarget && <TableHead>יעד</TableHead>}<TableHead>מטרה</TableHead><TableHead>סטטוס</TableHead><TableHead>סכום</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">אין תנועות עדיין</TableCell></TableRow>}
          {list.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
              <TableCell className="whitespace-nowrap">{when(r.created_at)}</TableCell>
              {withTarget && <TableCell className="max-w-[220px] truncate">{target(r)}</TableCell>}
              <TableCell className="max-w-[240px]"><span className="flex items-center gap-2">{iconFor(r)}<span className="truncate">{purpose(r)}</span></span></TableCell>
              <TableCell className="whitespace-nowrap">{statusOf(r)}</TableCell>
              <TableCell dir="ltr" className={`whitespace-nowrap text-right font-bold ${r.amount_ils < 0 ? 'text-destructive' : 'text-primary'}`}>
                {r.amount_ils > 0 ? '+' : ''}{money(r.amount_ils)}
                <span className="block text-xs font-normal text-muted-foreground">{r.amount_ils > 0 ? '+' : ''}{fmtCredits(ilsToCredits(r.amount_ils))}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-5 p-4">
      {locked && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-bold">החשבון מוגבל עד להסדרת התשלום</p>
            <p className="text-sm">
              {wallet?.lockReason === 'card_charge_pending'
                ? 'היתרה בארנק אזלה והחיוב בכרטיס השמור עדיין לא הושלם.'
                : 'היתרה בארנק אזלה ואין כרטיס אשראי שמור לחיוב אוטומטי.'}
              {' '}יש לטעון את הארנק כדי לחזור לפעילות מלאה.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border bg-card p-5">
          <div>
             <p className={`text-right text-3xl font-bold ${(wallet?.balance ?? 0) <= 0 ? 'text-destructive' : ''}`}>{fmtCompactCredits(ilsToCredits(wallet?.balance ?? 0), 2)}</p>
             <p className="text-sm text-muted-foreground" dir="ltr">{money(wallet?.balance ?? 0)}</p>
          </div>
          <Button onClick={() => setTopupOpen(true)}><Plus className="h-4 w-4" />טעינת ארנק</Button>
        </div>

      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">תשלומים ותנועות</TabsTrigger>
          <TabsTrigger value="deposits">היסטוריית הפקדות</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-3">{rows(payments, true)}</TabsContent>
        <TabsContent value="deposits" className="mt-3">{rows(deposits, false)}</TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>פרטי תנועה</DialogTitle></DialogHeader>
          {detail && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">מועד</dt><dd>{when(detail.created_at)}</dd>
              <dt className="text-muted-foreground">סוג</dt><dd>{purpose(detail)}</dd>
              <dt className="text-muted-foreground">סטטוס</dt><dd>{statusOf(detail)}</dd>
              <dt className="text-muted-foreground">סכום</dt><dd dir="ltr" className="text-right font-bold">{ils(detail.amount_ils)}</dd>
              {detail.listing_title && <><dt className="text-muted-foreground">נכס</dt><dd>{target(detail)}</dd></>}
              {detail.lead_name && <><dt className="text-muted-foreground">ליד</dt><dd>{detail.lead_name}</dd></>}
              {!!detail.gross && <><dt className="text-muted-foreground">עלות הפנייה</dt><dd>{ils(detail.gross)}</dd></>}
              {!!detail.extra_fee && <><dt className="text-muted-foreground">שדות/שאלות נוספים</dt><dd>{ils(detail.extra_fee)}</dd></>}
              {detail.dispute_status && <><dt className="text-muted-foreground">מחלוקת</dt><dd>{detail.dispute_status}</dd></>}
              {detail.note && <><dt className="text-muted-foreground">הערה</dt><dd>{detail.note}</dd></>}
              <dt className="text-muted-foreground">מזהה</dt><dd dir="ltr" className="text-right text-xs text-muted-foreground">{detail.id}</dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={topupOpen} onOpenChange={(open) => { setTopupOpen(open); if (!open) setCardOpen(false); }}>
        <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><WalletIcon className="h-5 w-5" />טעינת ארנק</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {[200, 500, 1000].map((a) => <Button key={a} variant="outline" disabled>{ils(a)}</Button>)}
          </div>
          <p className="text-sm text-muted-foreground">טעינה בכרטיס וחיוב אוטומטי עדיין אינם זמינים. לטעינת הארנק יש לפנות לצוות TORAFF.</p>
        <div className="space-y-3 border-t border-border pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><CreditCard className="h-4 w-4" />כרטיס לחיוב אוטומטי</p>
            <Button size="sm" variant="outline" onClick={() => setCardOpen(v => !v)}>{cards.length ? 'החלפת כרטיס' : 'הוספת כרטיס'}</Button>
          </div>
          {cards.length === 0 ? (
            <p className="text-sm">לא נשמר כרטיס. שמירת כרטיס אינה מחייבת אותו או טוענת את הארנק.</p>
          ) : cards.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-bold">{c.brand ?? 'כרטיס'} •••• {c.last4}</span>
              {c.exp_month && <span className="ms-2 text-muted-foreground">{String(c.exp_month).padStart(2, '0')}/{c.exp_year}</span>}
              <div className="text-muted-foreground">{c.auto_recharge_enabled ? `טעינה אוטומטית של ${ils(c.recharge_amount)}` : 'טעינה אוטומטית כבויה'}</div>
              {c.last_charge_error && <div className="text-destructive">{c.last_charge_error}</div>}
            </div>
          ))}
          {cardOpen && <SaveCardForm onDone={() => setCardOpen(false)} />}
        </div>
          {isSuperAdmin && <ZCreditSettingsCard />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
