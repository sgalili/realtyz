import React, { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ImportCommissionDialog } from './ImportCommissionDialog';
import { publishInventory, publicationErrorMessage } from '@/lib/publishInventory';
import { celebrateFromTop } from '@/lib/celebrate';
import { DEFAULT_IMPORT_RULE, importBatchDealTypes, importCommissionPayload, canApplyImportRule, averagePricesByDealType, type ImportCommissionRule } from '@/lib/importCommissionDefaults';

type Row = { id: string; deal_type: string | null; asking_price: number | null };

export function BulkClosingCommission({ ids, workspaceId, autoOpenKey, trigger, onSaved, overwriteOption = false, publishAfterSave = false }: {
  ids: string[]; workspaceId: string; autoOpenKey?: string | null; trigger?: (open: () => void) => React.ReactNode; onSaved?: () => void;
  /** Offer a checkbox that also targets workspace properties whose commissions are already set. */
  overwriteOption?: boolean;
  /** Publish the saved properties, show a summary, then go home with a celebration. */
  publishAfterSave?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [summary, setSummary] = useState<{ saved: number; published: number } | null>(null);
  const [rule, setRule] = useState<ImportCommissionRule>({ ...DEFAULT_IMPORT_RULE });
  const [rows, setRows] = useState<Row[]>([]);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, [workspaceId]);
  const autoOpened = useRef<string | null>(null);
  useEffect(() => { if (autoOpenKey && autoOpened.current !== autoOpenKey && ids.length) { autoOpened.current = autoOpenKey; void show(); } });
  const load = async (all: boolean) => {
    const run = ++version.current;
    let query = supabase.from('listings').select('id,deal_type,asking_price').eq('workspace_owner_id', workspaceId);
    query = all ? query.is('canonical_duplicate_of', null).limit(1000) : query.in('id', ids);
    const { data, error } = await query;
    if (run !== version.current) return;
    if (error || (!all && data?.length !== ids.length)) { toast.error('לא ניתן לטעון את הנכסים במשרד'); setOpen(false); return; }
    setRows(data ?? []);
  };
  // Open immediately on the first click; the property list loads inside the open window.
  const show = async () => {
    if (!ids.length) return;
    setOverwrite(false); setRows([]); setOpen(true);
    await load(false);
  };
  const toggleOverwrite = (next: boolean) => { setOverwrite(next); void load(next); };
  const types = importBatchDealTypes(rows.map(r => r.deal_type));
  const apply = async (accepted: boolean) => {
    if (saving || !canApplyImportRule(rule, types, accepted)) return;
    const run = version.current;
    setSaving(true);
    let failed = 0;
    const savedIds: string[] = [];
    for (const row of rows) {
      if (run !== version.current) return;
      // Re-read to preserve unrelated per-lead prices and the latest imported features.
      const { data: current, error: readError } = await supabase.from('listings').select('features,asking_price,deal_type').eq('workspace_owner_id', workspaceId).eq('id', row.id).maybeSingle();
      if (readError || !current) { failed++; continue; }
      const { closing, ...columns } = importCommissionPayload(current.deal_type, current.asking_price ?? 0, rule);
      const features = Array.isArray(current.features) ? current.features[0] : current.features;
      const { data, error } = await supabase.from('listings').update({ ...columns, features: { ...(features && typeof features === 'object' ? features : {}), deal_closing_commission: closing, commission_terms_accepted_at: new Date().toISOString() } }).eq('workspace_owner_id', workspaceId).eq('id', row.id).select('id').maybeSingle();
      if (error || !data) failed++; else savedIds.push(row.id);
    }
    if (run !== version.current) return;
    void qc.invalidateQueries({ queryKey: ['affiliate-configs'] });
    void qc.invalidateQueries({ queryKey: ['affiliate-config'] });
    if (failed) { setSaving(false); toast.error(`לא נשמרו עמלות ב-${failed} נכסים. אפשר לנסות שוב.`); return; }
    let published = 0;
    if (publishAfterSave && savedIds.length) {
      try { published = (await publishInventory(supabase, workspaceId, savedIds)).length; }
      catch (error) { toast.error(publicationErrorMessage(error)); }
    }
    setSaving(false); setOpen(false);
    void qc.invalidateQueries(); onSaved?.();
    if (publishAfterSave) setSummary({ saved: savedIds.length, published });
    else toast.success(`העמלות נשמרו ב-${rows.length} נכסים`);
  };
  const finish = () => { setSummary(null); navigate('/'); window.setTimeout(() => celebrateFromTop(7000), 150); };
  const extra = overwriteOption ? <div className="flex items-start gap-2 rounded-lg border border-border p-3"><Checkbox id="commission-overwrite" checked={overwrite} disabled={saving} onCheckedChange={next => toggleOverwrite(next === true)} className="mt-1 shrink-0" /><Label htmlFor="commission-overwrite" className="text-sm font-medium leading-relaxed">החל גם על נכסים שכבר הוגדרו להם עמלות</Label></div> : null;
  return <>
    {trigger ? trigger(() => void show()) : <Button variant="ghost" size="icon" title="הגדרת עמלות לנבחרים" aria-label="הגדרת עמלות לנבחרים" onClick={() => void show()}><Settings2 className="h-4 w-4" /></Button>}
    <ImportCommissionDialog closingOnly open={open} onOpenChange={setOpen} count={rows.length} types={types} rule={rule} onRuleChange={setRule} saving={saving} onApply={accepted => void apply(accepted)} prices={averagePricesByDealType(rows)} extra={extra} />
    <AlertDialog open={!!summary} onOpenChange={next => { if (!next) finish(); }}>
      <AlertDialogContent dir="rtl" className="w-[calc(100%-2rem)] rounded-lg">
        <AlertDialogHeader><AlertDialogTitle>סיכום פרסום</AlertDialogTitle><AlertDialogDescription className="text-start text-base leading-relaxed">העמלות נשמרו ב־{summary?.saved ?? 0} נכסים{summary && summary.published > 0 ? ` ו־${summary.published} נכסים פורסמו בלוח.` : '. לא פורסמו נכסים חדשים.'}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><Button className="w-full" onClick={finish}>אישור</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
