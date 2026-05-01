import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Database, Download, Eraser, Loader2, ShieldAlert, Globe, Sparkles, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const PRODUCTION_HOST_HINT = 'realtyz.udiman.com';

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.info('אין נתונים לייצוא');
    return;
  }
  const headers = Array.from(
    rows.reduce<Set<string>>((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()),
  );
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape((r as any)[h])).join(',')),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProductionPrepPanel() {
  const qc = useQueryClient();
  const [seedBusy, setSeedBusy] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [leadIdToClear, setLeadIdToClear] = useState('');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isProductionDomain = currentOrigin.includes(PRODUCTION_HOST_HINT);

  const seed = async () => {
    setSeedBusy(true);
    try {
      const { data, error } = await supabase.rpc('seed_demo_data' as any);
      if (error) throw error;
      const r = data as any;
      if (r?.status === 'exists') toast.info('נתוני דמו כבר טעונים');
      else toast.success(`נטענו ${r?.leads ?? 0} מתעניינים ו-${r?.listings ?? 0} נכסים לדוגמה`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error('שגיאה בטעינת דמו', { description: e.message });
    } finally { setSeedBusy(false); }
  };

  const wipe = async () => {
    setWipeBusy(true);
    try {
      const { data, error } = await supabase.rpc('wipe_demo_data' as any);
      if (error) throw error;
      const r = data as any;
      toast.success(`נמחקו ${r?.leads ?? 0} מתעניינים ו-${r?.listings ?? 0} נכסים מסומני דמו`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error('שגיאה במחיקת דמו', { description: e.message });
    } finally { setWipeBusy(false); }
  };

  const exportLeads = async (format: 'csv' | 'xlsx') => {
    setExportBusy(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, email, city, neighborhood, interest_tag, lead_stage, deal_type, loyalty_tier, sentiment, engagement_score, priority_score, interaction_outcome, commission_amount, commission_currency, expected_close_date, assigned_to, created_at, last_interaction_at, is_demo')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        downloadCSV(`realtyz-leads-${stamp}.csv`, rows);
      } else {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Leads');
        XLSX.writeFile(wb, `realtyz-leads-${stamp}.xlsx`);
      }
      toast.success(`ייצוא הסתיים (${rows.length} רשומות)`);
    } catch (e: any) {
      toast.error('שגיאה בייצוא', { description: e.message });
    } finally { setExportBusy(false); }
  };

  const clearPersonalData = async () => {
    if (!leadIdToClear.trim()) {
      toast.error('יש להזין מזהה מתעניין');
      return;
    }
    setClearBusy(true);
    try {
      const { error } = await supabase.rpc('clear_lead_personal_data' as any, { _lead_id: leadIdToClear.trim() });
      if (error) throw error;
      toast.success('פרטי הקשר נמחקו (הרשומה נשמרה לצרכי אנליטיקה)');
      setLeadIdToClear('');
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error('שגיאה במחיקת PII', { description: e.message });
    } finally { setClearBusy(false); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Domain & Environment status */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            דומיין וסביבה
          </CardTitle>
          <CardDescription className="text-xs">
            הסביבה הנוכחית: <span className="font-mono">{currentOrigin || '—'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className={`rounded-lg border p-3 ${isProductionDomain ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
            <div className="font-semibold mb-1">
              {isProductionDomain ? '✓ פועל על הדומיין הפרודקשן' : 'פועל על דומיין פיתוח / preview'}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              לחיבור הדומיין <span dir="ltr" className="font-mono">{PRODUCTION_HOST_HINT}</span> — היכנס ל-
              <span className="font-semibold"> Project Settings → Domains</span>, הוסף את הדומיין, והגדר אצל הרשם:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>A record: <code dir="ltr" className="font-mono text-[11px]">@ → 185.158.133.1</code></li>
                <li>A record: <code dir="ltr" className="font-mono text-[11px]">www → 185.158.133.1</code></li>
                <li>TXT record: <code dir="ltr" className="font-mono text-[11px]">_lovable → lovable_verify=...</code></li>
              </ul>
              SSL מונפק אוטומטית תוך מספר דקות לאחר שה-DNS מתעדכן.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demo data toggle */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            סביבת הדגמה · Realtyz Demo Mode
          </CardTitle>
          <CardDescription className="text-xs">
            טען נתוני דמו לסיורי מכירה / הדגמה, או נקה אותם כדי להתחיל בסביבה ריקה לפרודקשן.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={seed} disabled={seedBusy} size="sm">
            {seedBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" /> : <Database className="h-3.5 w-3.5 ml-1.5" />}
            Load Realtyz Demo Mode
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={wipeBusy}>
                {wipeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" /> : <Eraser className="h-3.5 w-3.5 ml-1.5" />}
                נקה נתוני דמו
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>למחוק את כל נתוני הדמו?</AlertDialogTitle>
                <AlertDialogDescription>
                  הפעולה תמחק רק רשומות מסומנות <span className="font-mono">is_demo=true</span> ששייכות לחשבון שלך. נתוני אמת לא ייפגעו.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={wipe}>מחק דמו</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Export */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            ייצוא כל המתעניינים (גיבוי / Backup)
          </CardTitle>
          <CardDescription className="text-xs">
            הנתונים שלך — בבעלותך. יצא לקובץ CSV או Excel בכל רגע.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => exportLeads('csv')} disabled={exportBusy} size="sm" variant="outline">
            {exportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" /> : <Download className="h-3.5 w-3.5 ml-1.5" />}
            ייצא ל-CSV
          </Button>
          <Button onClick={() => exportLeads('xlsx')} disabled={exportBusy} size="sm" variant="outline">
            {exportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" /> : <Download className="h-3.5 w-3.5 ml-1.5" />}
            ייצא ל-Excel
          </Button>
        </CardContent>
      </Card>

      {/* Clear personal data */}
      <Card className="border-destructive/30 bg-destructive/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            מחיקת פרטים אישיים (GDPR / חוק הגנת הפרטיות)
          </CardTitle>
          <CardDescription className="text-xs">
            לבקשת מחיקה של מתעניין: שם, טלפון, אימייל, ת.ז ופרופילים חברתיים יוחלפו ב-[REDACTED]. הרשומה תישאר לצרכי אנליטיקה אנונימית.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-id-pii" className="text-xs">מזהה מתעניין (Lead ID)</Label>
            <Input
              id="lead-id-pii"
              dir="ltr"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={leadIdToClear}
              onChange={(e) => setLeadIdToClear(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={clearBusy || !leadIdToClear.trim()}>
                {clearBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" /> : <Trash2 className="h-3.5 w-3.5 ml-1.5" />}
                מחק פרטים אישיים
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>לאשר מחיקת פרטים אישיים?</AlertDialogTitle>
                <AlertDialogDescription>
                  הפעולה אינה הפיכה. כל פרטי הקשר וההודעות של המתעניין יוחלפו ב-[REDACTED] ויירשם תיעוד ב-audit log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={clearPersonalData} className="bg-destructive hover:bg-destructive/90">
                  אני מאשר/ת את המחיקה
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
