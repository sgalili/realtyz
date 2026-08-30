import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Check,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  PhoneCall,
  Send,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { CreditBalancePill } from '@/components/CreditBalancePill';
import { PriceTag } from '@/components/PriceTag';
import { fmtILS } from '@/lib/formatCurrency';
import {
  PACKAGES,
  YEARLY_PAID_MONTHS,
  limitLabel,
  recommendedPackage,
  yearlyPrice,
  type PricingPackage,
} from '@/lib/pricing';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TouchCreditsExplainerBody, TouchCreditsExplainerLink } from '@/components/billing/TouchCreditsExplainer';
import {
  CHANNEL_RATES,
  EXTRA_TC_PRICE_PER_CONTACT,
  FREE_TC_PER_CONTACT,
  includedTc,
  type ChannelKey,
} from '@/lib/touchCredits';
import { useAuth } from '@/hooks/useAuth';
import { useFreemiumStatus } from '@/hooks/useFreemiumStatus';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const SALES_PHONE = '972546811841';

const CHANNEL_ICONS: Record<ChannelKey, typeof Send> = {
  sms: Send,
  whatsapp: MessageCircle,
  voice: Phone,
  ivr: PhoneCall,
  email: Mail,
};

const heNum = (n: number) => Math.round(n).toLocaleString('he-IL');

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function heDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function downloadInvoice(row: { id: string; created_at: string; amount: number; reason: string | null }, email?: string | null) {
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>חשבונית ${row.id.slice(0, 8)}</title>
<style>body{font-family:Assistant,Arial,sans-serif;padding:40px;color:#1b2a4f}
h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}
td,th{border:1px solid #dbe1ee;padding:10px;text-align:right}
.total{font-size:20px;font-weight:800;margin-top:20px}</style></head><body>
<h1>Realtyz — חשבונית / קבלה</h1>
<div>מספר מסמך: ${row.id.slice(0, 8).toUpperCase()}</div>
<div>תאריך: ${heDate(row.created_at)}</div>
<div>לקוח: ${email ?? '—'}</div>
<table><thead><tr><th>תיאור</th><th>סכום</th></tr></thead>
<tbody><tr><td>${row.reason ?? 'הטענת ארנק קרדיטים'}</td><td>${fmtILS(row.amount, { fractionDigits: 2 })}</td></tr></tbody></table>
<div class="total">סה"כ: ${fmtILS(row.amount, { fractionDigits: 2 })}</div>
<p style="margin-top:32px;font-size:12px;color:#64748b">המחירים אינם כוללים מע"מ.</p>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `realtyz-invoice-${row.id.slice(0, 8)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BillingTab() {
  const { user } = useAuth();
  const { contactsUsed, propertiesUsed } = useFreemiumStatus();
  const currentPackage = useMemo(
    () => recommendedPackage(contactsUsed, propertiesUsed),
    [contactsUsed, propertiesUsed],
  );

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const { data: usageRows = [] } = useQuery({
    queryKey: ['tc_usage_month', user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_logs')
        .select('service_type, quantity, cost, created_at')
        .eq('user_id', user!.id)
        .eq('is_demo', false)
        .gte('created_at', monthStartIso());
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['billing_invoices', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balance_adjustments')
        .select('id, amount, reason, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const perChannel = useMemo(() => {
    const map = new Map<ChannelKey, { qty: number; cost: number }>();
    for (const rate of CHANNEL_RATES) map.set(rate.key, { qty: 0, cost: 0 });
    for (const row of usageRows as { service_type: string; quantity: number | null; cost: number | null }[]) {
      const rate = CHANNEL_RATES.find((r) => r.serviceTypes.includes(row.service_type));
      if (!rate) continue;
      const cur = map.get(rate.key)!;
      cur.qty += Number(row.quantity ?? 0);
      cur.cost += Number(row.cost ?? 0);
    }
    return map;
  }, [usageRows]);

  const usedTc = useMemo(
    () => Array.from(perChannel.values()).reduce((s, v) => s + v.qty, 0),
    [perChannel],
  );
  const included = includedTc(contactsUsed);
  const pct = included > 0 ? Math.min(100, (usedTc / included) * 100) : 0;

  const requestUpgrade = (pkg: PricingPackage) => {
    const text =
      billingCycle === 'yearly'
        ? `היי, אני רוצה לשדרג את רילטיז לחבילת ${pkg.name} בתשלום שנתי (${fmtILS(yearlyPrice(pkg.monthlyPrice))} לשנה).`
        : `היי, אני רוצה לשדרג את רילטיז לחבילת ${pkg.name} (${fmtILS(pkg.monthlyPrice)} לחודש).`;
    window.open(`https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div dir="rtl" className="space-y-4 text-right">
      {/* חבילה נוכחית + ארנק */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">החבילה שלך: {currentPackage.name}</CardTitle>
              <CardDescription>
                {currentPackage.monthlyPrice === 0 ? 'מסלול חינם' : `${fmtILS(currentPackage.monthlyPrice)} לחודש`} ·{' '}
                {limitLabel(currentPackage.contacts)} אנשי קשר
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">יתרת ארנק</span>
              <CreditBalancePill />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground"></span>
            <span className="font-bold tabular-nums">
              
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground"></p>
        </CardContent>
      </Card>

      {/* מדדי T.C. לפי ערוץ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">צריכת קרדיטים</CardTitle>
          <CardDescription></CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNEL_RATES.map((rate) => {
            const Icon = CHANNEL_ICONS[rate.key];
            const stat = perChannel.get(rate.key)!;
            const share = usedTc > 0 ? (stat.qty / usedTc) * 100 : 0;
            return (
              <div key={rate.key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-primary" />
                    {rate.label}
                  </span>
                  <span className="text-lg font-bold tabular-nums">{heNum(stat.qty)}</span>
                </div>
                <Progress value={share} className="mt-2 h-1.5" />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>T.C. החודש</span>
                  <span>
                    עלות בפועל: <PriceTag value={stat.cost} fractionDigits={2} />
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* מדיניות T.C. */}
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">מדיניות קרדיטים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              עד <b>{FREE_TC_PER_CONTACT} פעולות מצד המערכת לכל איש קשר בחודש</b> כלולים במלואם בחבילה.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              פעולה נוספת מעל המכסה: <b><PriceTag value={EXTRA_TC_PRICE_PER_CONTACT} fractionDigits={2} /> לאיש קשר</b>.&nbsp;
              החיוב הוא לכל איש קשר בודד ולא לפי נפח מצטבר.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              כל השירותים שמופעלים על ידי ה-AI (WhatsApp, SMS, אימייל, שיחות קוליות, פרסום ברשתות, מענה לתגובות ו-IVR) כלולים בחבילה.
              חיוב נוסף חל רק על הפצה פרטית שאינה נדרשת על ידי ה-AI.
            </span>
          </p>
          <div className="flex items-center gap-3 pt-1">
            <CreditBalancePill />
            <TouchCreditsExplainerLink />
          </div>
        </CardContent>
      </Card>

      {/* תעריפי הפצה פרטית */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">תעריפי הפצה פרטית (מחוץ ל-AI)</CardTitle>
          <CardDescription>התעריפים הזולים בישראל בכל הערוצים</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {CHANNEL_RATES.map((rate) => {
              const Icon = CHANNEL_ICONS[rate.key];
              return (
                <div key={rate.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {rate.label}
                  </span>
                  <span className="font-semibold tabular-nums">
                    <PriceTag value={rate.price} fractionDigits={2} />
                    <span className="ms-1 text-xs font-normal text-muted-foreground">{rate.unit}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="px-4 py-3 text-xs text-muted-foreground">{'המחירים אינם כוללים מע"מ.\u00a0'}</p>
        </CardContent>
      </Card>

      {/* שדרוג חבילה */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">שדרוג חבילה</CardTitle>
            <Tabs
              dir="rtl"
              value={billingCycle}
              onValueChange={(v) => setBillingCycle(v as 'monthly' | 'yearly')}
            >
              <TabsList className="h-8">
                <TabsTrigger value="monthly" className="text-xs">חודשי</TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs">
                  שנתי · {12 - YEARLY_PAID_MONTHS} חודשים מתנה
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={cn(
                'flex flex-col gap-2 rounded-xl border border-border p-3',
                pkg.id === currentPackage.id && 'border-2 border-primary',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{pkg.name}</span>
                {pkg.id === currentPackage.id && (
                  <Badge variant="secondary" className="text-[10px]">נוכחי</Badge>
                )}
              </div>
              <span className="text-2xl font-bold text-primary">
                <bdi dir="ltr">
                  {pkg.monthlyPrice === 0
                    ? '₪0'
                    : fmtILS(billingCycle === 'yearly' ? yearlyPrice(pkg.monthlyPrice) : pkg.monthlyPrice)}
                </bdi>
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  {billingCycle === 'yearly' ? '/ שנה' : '/ חודש'}
                </span>
              </span>
              {billingCycle === 'yearly' && pkg.monthlyPrice > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  שווה ערך ל-{fmtILS(Math.round((yearlyPrice(pkg.monthlyPrice) / 12) * 100) / 100)} לחודש
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {limitLabel(pkg.contacts)} אנשי קשר
              </span>
              <Button
                size="sm"
                variant={pkg.id === currentPackage.id ? 'outline' : 'default'}
                disabled={pkg.id === currentPackage.id}
                onClick={() => requestUpgrade(pkg)}
                className="mt-auto"
              >
                {pkg.id === currentPackage.id ? 'המסלול הנוכחי' : `שדרוג ל${pkg.name}`}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* הסבר מלא על מגעי קרדיט */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">איך עובדים מגעי קרדיט (T.C)?</CardTitle>
          <CardDescription>הסבר מלא, דוגמאות ואופן חישוב חריגה</CardDescription>
        </CardHeader>
        <CardContent>
          <TouchCreditsExplainerBody />
        </CardContent>
      </Card>

      {/* חיובים וחשבוניות */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> חיובים וחשבוניות
          </CardTitle>
          <CardDescription></CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              אין עדיין רכישות. אחרי ההטענה הראשונה החשבוניות יופיעו כאן.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">תאריך</TableHead>
                  <TableHead className="text-right">תיאור</TableHead>
                  <TableHead className="text-right">סכום</TableHead>
                  <TableHead className="text-right">חשבונית</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoices as { id: string; amount: number; reason: string | null; created_at: string }[]).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{heDate(row.created_at)}</TableCell>
                    <TableCell>{row.reason ?? 'הטענת ארנק קרדיטים'}</TableCell>
                    <TableCell className="tabular-nums">
                      <PriceTag value={row.amount} fractionDigits={2} />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => downloadInvoice(row, user?.email)}>
                        <Download className="me-1 h-3.5 w-3.5" /> הורדה
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" />
        
      </p>
    </div>
  );
}
