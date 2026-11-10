import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ImportCommissionDialog } from './ImportCommissionDialog';
import { DEFAULT_IMPORT_RULE, importBatchDealTypes, importCommissionPayload, canApplyImportRule, type ImportCommissionRule } from '@/lib/importCommissionDefaults';

export function BulkClosingCommission({ ids, workspaceId }: { ids: string[]; workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<ImportCommissionRule>({ ...DEFAULT_IMPORT_RULE });
  const [rows, setRows] = useState<Array<{ id: string; deal_type: string | null; asking_price: number | null }>>([]);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, [workspaceId]);
  const show = async () => {
    const run = ++version.current;
    const { data, error } = await supabase.from('listings').select('id,deal_type,asking_price').eq('workspace_owner_id', workspaceId).in('id', ids);
    if (run !== version.current) return;
    if (error || data?.length !== ids.length) { toast.error('לא ניתן לטעון את הנכסים הנבחרים במשרד'); return; }
    setRows(data); setOpen(true);
  };
  const types = importBatchDealTypes(rows.map(r => r.deal_type));
  const apply = async (accepted: boolean) => {
    if (saving || !canApplyImportRule(rule, types, accepted)) return;
    const run = version.current;
    setSaving(true);
    let failed = 0;
    for (const row of rows) {
      if (run !== version.current) return;
      // Re-read to preserve unrelated per-lead prices and the latest imported features.
      const { data: current, error: readError } = await supabase.from('listings').select('features,asking_price,deal_type').eq('workspace_owner_id', workspaceId).eq('id', row.id).maybeSingle();
      if (readError || !current) { failed++; continue; }
      const { closing } = importCommissionPayload(current.deal_type, current.asking_price ?? 0, rule);
      const features = Array.isArray(current.features) ? current.features[0] : current.features;
      const { data, error } = await supabase.from('listings').update({ affiliate_tier4_type: closing.type, affiliate_tier4_amount: closing.value, features: { ...(features && typeof features === 'object' ? features : {}), deal_closing_commission: closing, commission_terms_accepted_at: new Date().toISOString() } }).eq('workspace_owner_id', workspaceId).eq('id', row.id).select('id').maybeSingle();
      if (error || !data) failed++;
    }
    if (run !== version.current) return;
    setSaving(false);
    void qc.invalidateQueries({ queryKey: ['affiliate-configs'] });
    void qc.invalidateQueries({ queryKey: ['affiliate-config'] });
    if (failed) toast.error(`לא נשמרו עמלות ב-${failed} נכסים. אפשר לנסות שוב.`);
    else { setOpen(false); toast.success(`עמלות הסגירה נשמרו ב-${rows.length} נכסים`); }
  };
  return <><Button variant="ghost" size="icon" title="עמלות סגירה לנבחרים" aria-label="עמלות סגירה לנבחרים" onClick={() => void show()}><Settings2 className="h-4 w-4" /></Button><ImportCommissionDialog closingOnly open={open} onOpenChange={setOpen} count={rows.length} types={types} rule={rule} onRuleChange={setRule} saving={saving} onApply={accepted => void apply(accepted)} /></>;
}