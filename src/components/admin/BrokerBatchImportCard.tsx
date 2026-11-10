import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { parseBrokerBatch, normalizeBatchBroker } from '../../../supabase/functions/_shared/brokerBatchImport';

type Row = ReturnType<typeof parseBrokerBatch>[number] & { result?: string };

export function BrokerBatchImportCard() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const qc = useQueryClient();
  const preview = () => {
    setError('');
    try {
      const parsed = parseBrokerBatch(text);
      if (!parsed.length) throw new Error('empty');
      setRows(parsed.map(r => { const n = normalizeBatchBroker(r); return { ...r, result: !r.full_name ? 'חסר שם' : !n.phone ? 'נייד לא תקין' : !/^[1-9]\d{3,9}$/.test(r.license_number) ? 'רישיון לא תקין' : !n.urls.length ? 'אין קישורי מודעות' : undefined }; }));
    } catch { setRows([]); setError('לא הצלחתי לקרוא את הקובץ. יש להדביק רשימת מתווכים בפורמט JSON.'); }
  };
  const run = async () => {
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].result) continue;
      setRows(rs => rs.map((r, j) => j === i ? { ...r, result: 'מייבא…' } : r));
      const { listing_urls, ...rest } = rows[i];
      const { data, error } = await supabase.functions.invoke('admin-broker-batch-import', { body: { broker: { ...rest, listing_urls } } });
      let msg: string;
      if (error) { const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; msg = typeof d?.error === 'string' ? d.error : 'הייבוא נכשל'; }
      else msg = data.status === 'ok' ? `${data.created ? 'נוצר' : 'קיים'} · ${data.imported}/${data.listings.length} מודעות נוספו כטיוטה` : data.reason;
      setRows(rs => rs.map((r, j) => j === i ? { ...r, result: msg } : r));
    }
    setRunning(false);
    void qc.invalidateQueries({ queryKey: ['admin-profiles'] }); void qc.invalidateQueries({ queryKey: ['broker-onboarding'] });
  };
  const ready = rows.filter(r => !r.result).length;
  return <section dir="rtl" className="space-y-3 rounded-lg border border-border p-4 text-right">
    <div><h3 className="font-semibold">הוספת קבוצת מתווכים מ־Bright Data</h3><p className="text-sm text-muted-foreground">לכל מתווך נוצר פרופיל עם המשרד והרישיון, והמודעות הפעילות שלו נוספות כטיוטות לבדיקה. לא נשלחת שום הודעה.</p></div>
    <Textarea dir="ltr" rows={5} value={text} disabled={running} placeholder='[{"full_name":"","phone":"05X","license_number":"","office_name":"","email":"","listing_urls":["https://www.yad2.co.il/realestate/item/..."]}]' onChange={e => { setText(e.target.value); setRows([]); }} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows.length > 0 && <ul className="space-y-1 text-sm">{rows.map((r, i) => <li key={i} className="flex justify-between gap-2 border-b border-border py-1"><span>{r.full_name || '—'} · {r.listing_urls.length} מודעות</span><span className="text-muted-foreground">{r.result ?? 'מוכן'}</span></li>)}</ul>}
    <div className="flex justify-between gap-2"><Button variant="outline" disabled={!text.trim() || running} onClick={preview}>בדיקת הרשימה</Button><Button disabled={!ready || running} onClick={() => void run()}><Upload className="h-4 w-4" />{running ? 'מייבא…' : `ייבוא ${ready} מתווכים`}</Button></div>
  </section>;
}
