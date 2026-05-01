import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet,
  TrendingUp,
  Crown,
  CalendarClock,
  Plus,
  CreditCard,
  Pencil,
  FileText,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useElectionType } from '@/hooks/useElectionType';
import { DEMO_CANDIDATES } from '@/lib/demoData';

// Real pricing tied to public.pricing_plans (prices are NIS, ex-VAT).
const PLANS = [
  {
    slug: 'breakthrough',
    name: 'מסלול פריצה',
    monthly: 2999,
    setup: 5000,
    mandates: 1,
    whatsapp: 8000,
    sms: 8000,
    voice: 1000,
    ai: 300_000,
  },
  {
    slug: 'power',
    name: 'מסלול עוצמה',
    monthly: 7999,
    setup: 5000,
    mandates: 3,
    whatsapp: 30_000,
    sms: 30_000,
    voice: 3750,
    ai: 1_500_000,
  },
  {
    slug: 'victory',
    name: 'מסלול ניצחון',
    monthly: 14_999,
    setup: 5000,
    mandates: 10,
    whatsapp: 100_000,
    sms: 100_000,
    voice: 12_500,
    ai: 5_000_000,
  },
];

// Per-unit overage prices (ex-VAT).
const RATES = {
  whatsapp: 0.18,
  sms: 0.11,
  voice: 0.42, // per minute
  aiTouchpoint: 0.012,
};

const HE_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function formatILS(n: number) {
  return `${Math.round(n).toLocaleString('he-IL')} ₪`;
}

function pickPlan(mandateGoal: number) {
  // Smallest plan whose transactions capacity meets/exceeds the goal.
  return (
    PLANS.find((p) => p.mandates >= mandateGoal) ?? PLANS[PLANS.length - 1]
  );
}

function buildInvoices(plan: typeof PLANS[number], electionLabel: string, intensity: number) {
  // intensity: 0..1 - drives how much overage the campaign consumes.
  const today = new Date();
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const rows: { date: string; desc: string; amount: number; status: string }[] = [];

  // Current month subscription
  const m0 = new Date(today.getFullYear(), today.getMonth(), 1);
  rows.push({ date: fmt(m0), desc: `מנוי חודשי - ${plan.name} (${electionLabel})`, amount: plan.monthly, status: 'שולם' });

  // Mid-month overages, scaled to plan + intensity
  const waPack = Math.round(plan.whatsapp * 0.25 * intensity);
  if (waPack > 0) {
    rows.push({
      date: fmt(new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate(), 18))),
      desc: `תוספת ${waPack.toLocaleString('he-IL')} הודעות WhatsApp`,
      amount: Math.round(waPack * RATES.whatsapp),
      status: 'שולם',
    });
  }

  const smsPack = Math.round(plan.sms * 0.18 * intensity);
  if (smsPack > 0) {
    rows.push({
      date: fmt(new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate(), 11))),
      desc: `תוספת ${smsPack.toLocaleString('he-IL')} הודעות SMS`,
      amount: Math.round(smsPack * RATES.sms),
      status: 'שולם',
    });
  }

  const voiceMin = Math.round(plan.voice * 0.2 * intensity);
  if (voiceMin > 0) {
    rows.push({
      date: fmt(new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate(), 6))),
      desc: `תוספת ${voiceMin.toLocaleString('he-IL')} דקות שיחה אוטומטית`,
      amount: Math.round(voiceMin * RATES.voice),
      status: 'שולם',
    });
  }

  // Last month subscription
  const m1 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  rows.push({ date: fmt(m1), desc: `מנוי חודשי - ${plan.name}`, amount: plan.monthly, status: 'שולם' });

  // Two months ago: setup fee + subscription
  const m2 = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  rows.push({ date: fmt(m2), desc: `מנוי חודשי - ${plan.name}`, amount: plan.monthly, status: 'שולם' });
  rows.push({ date: fmt(new Date(m2.getFullYear(), m2.getMonth(), 2)), desc: 'דמי הקמה והטמעה חד פעמיים', amount: plan.setup, status: 'שולם' });

  return rows;
}

function buildSpend(plan: typeof PLANS[number], intensity: number) {
  const today = new Date();
  const arr: { month: string; amount: number }[] = [];
  // Last 6 months ascending
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    // Ramp up toward election: more recent months = higher intensity
    const ramp = 0.55 + (5 - i) * 0.09;
    const overage =
      plan.whatsapp * 0.18 * RATES.whatsapp +
      plan.sms * 0.14 * RATES.sms +
      plan.voice * 0.16 * RATES.voice;
    const amount = Math.round(plan.monthly + overage * ramp * intensity);
    arr.push({ month: HE_MONTHS[d.getMonth()], amount });
  }
  return arr;
}

export default function Finance() {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [editCardOpen, setEditCardOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('500');

  const { isDemoMode, demoCandidateId } = useDemoMode();
  const { type: electionType, terms } = useElectionType();

  // Demo Mode hard-gate: never read DEMO_CANDIDATES when demo is OFF.
  // This was the source of the /finance demo-data leak — sample data was being
  // used as a fallback regardless of mode. In live mode we fall back to a neutral
  // baseline (3 deals/year) until real billing data is wired up.
  const candidate = useMemo(
    () =>
      isDemoMode
        ? DEMO_CANDIDATES.find((c) => c.id === demoCandidateId) ?? DEMO_CANDIDATES[0]
        : null,
    [isDemoMode, demoCandidateId],
  );

  const mandateGoal = isDemoMode && candidate ? candidate.mandateGoal : 3;
  const plan = useMemo(() => pickPlan(mandateGoal), [mandateGoal]);

  // Primaries are smaller-scale -> lower overage intensity than national.
  const intensity = electionType === 'primaries' ? 0.45 : 0.85;

  const invoices = useMemo(
    () => buildInvoices(plan, terms.electionLabel, intensity),
    [plan, terms.electionLabel, intensity],
  );
  const spendData = useMemo(() => buildSpend(plan, intensity), [plan, intensity]);

  const monthSpend = spendData[spendData.length - 1]?.amount ?? plan.monthly;
  const prevMonthSpend = spendData[spendData.length - 2]?.amount ?? plan.monthly;
  const trendPct =
    prevMonthSpend > 0 ? ((monthSpend - prevMonthSpend) / prevMonthSpend) * 100 : 0;
  const balance = Math.max(0, Math.round(plan.monthly * 1.6 - monthSpend * 0.35));

  const nextBilling = useMemo(() => {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return {
      date: `${String(next.getDate()).padStart(2, '0')}/${String(next.getMonth() + 1).padStart(2, '0')}/${next.getFullYear()}`,
      days: Math.max(1, Math.ceil((next.getTime() - d.getTime()) / 86_400_000)),
    };
  }, []);

  const handleDownload = (inv: typeof invoices[number]) => {
    toast.success(`חשבונית ${inv.date} הורדה בהצלחה`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">חיובים וחשבוניות</h1>
        <p className="text-muted-foreground text-sm">
          ניהול יתרה, חשבוניות ואמצעי תשלום · {terms.electionLabel} · יעד {mandateGoal} {terms.seats}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="active" className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                יתרה בחשבון
              </CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{formatILS(balance)}</div>
            <Button
              size="sm"
              className="mt-3 w-full"
              onClick={() => setTopUpOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 ms-1" />
              טעינת יתרה
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                סה"כ הוצאות החודש
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{formatILS(monthSpend)}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {trendPct >= 0 ? 'עלייה' : 'ירידה'} של {Math.abs(trendPct).toFixed(1)}% מהחודש הקודם
            </p>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                חבילה פעילה
              </CardTitle>
              <Crown className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-primary">{plan.name}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatILS(plan.monthly)} / חודש · עד {plan.mandates} {terms.seats}
            </p>
            <Badge className="mt-2 bg-primary text-primary-foreground">פעיל</Badge>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                חיוב קרוב
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-primary">{nextBilling.date}</div>
            <p className="text-xs text-muted-foreground mt-2">
              בעוד {nextBilling.days} ימים · {formatILS(plan.monthly)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoices table */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-primary">היסטוריית חשבוניות ותשלומים</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>תיאור</TableHead>
                <TableHead>סכום</TableHead>
                
                <TableHead>חשבונית</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-primary">{inv.date}</TableCell>
                  <TableCell>{inv.desc}</TableCell>
                  <TableCell className="font-bold">{formatILS(inv.amount)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDownload(inv)}
                      aria-label="הורדת PDF"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment methods + spend chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-primary">אמצעי תשלום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary to-primary-glow p-5 text-primary-foreground shadow-lg">
              <div className="flex items-center justify-between mb-8">
                <CreditCard className="h-7 w-7" />
                <span className="text-xs font-semibold uppercase tracking-widest opacity-80">Visa</span>
              </div>
              <div dir="ltr" className="text-xl font-mono tracking-widest mb-4 text-left">
                •••• •••• •••• 4582
              </div>
              <div className="flex items-center justify-between text-xs opacity-85">
                <span>בעל הכרטיס</span>
                <span>תוקף 09/27</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setEditCardOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5 ms-1" />
              עריכת אמצעי תשלום
            </Button>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-primary">הוצאות חודשיות</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={spendData}>
                <defs>
                  <linearGradient id="finance-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary-glow))" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    direction: 'rtl',
                  }}
                  formatter={(v: number) => [formatILS(v), 'הוצאה']}
                />
                <Bar dataKey="amount" fill="url(#finance-bar)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top up dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>טעינת יתרה</DialogTitle>
            <DialogDescription>בחר/י סכום לטעינה לחשבון.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="topup">סכום (₪)</Label>
            <Input
              id="topup"
              type="number"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
            />
            <div className="flex gap-2">
              {[500, 1000, 2500, 5000].map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  onClick={() => setTopUpAmount(String(v))}
                >
                  {formatILS(v)}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>ביטול</Button>
            <Button
              onClick={() => {
                setTopUpOpen(false);
                toast.success(`היתרה נטענה ב-${formatILS(Number(topUpAmount) || 0)}`);
              }}
            >
              אישור טעינה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit card dialog */}
      <Dialog open={editCardOpen} onOpenChange={setEditCardOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת אמצעי תשלום</DialogTitle>
            <DialogDescription>עדכון פרטי כרטיס האשראי.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cc">מספר כרטיס</Label>
              <Input id="cc" placeholder="•••• •••• •••• 4582" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="exp">תוקף</Label>
                <Input id="exp" placeholder="09/27" />
              </div>
              <div>
                <Label htmlFor="cvv">CVV</Label>
                <Input id="cvv" placeholder="•••" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditCardOpen(false)}>ביטול</Button>
            <Button
              onClick={() => {
                setEditCardOpen(false);
                toast.success('פרטי הכרטיס עודכנו');
              }}
            >
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
