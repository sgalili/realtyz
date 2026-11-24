import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { recheckRedBrokers, type RegistryProgress, type RegistryTarget } from '@/lib/bulkBrokerRegistry';

export const registryProgressText = (p: RegistryProgress) => `נבדקו ${p.done}/${p.total} · אומתו ${p.verified}${p.failed ? ` · לא אומתו ${p.failed}` : ''}${p.missing ? ` · ללא רישיון תקין ${p.missing}` : ''}`;
export function BulkBrokerRegistryRecheck({ onProgress }: { onProgress: (text: string) => void }) {
  const gate = useSuperAdminGate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const generation = useRef(0);
  const scope = useRef('');
  scope.current = gate.enabled ? gate.uid : '';
  useEffect(() => { generation.current++; working.current = false; setBusy(false); onProgress(''); return () => { generation.current++; scope.current = ''; }; }, [gate.uid, gate.enabled]);
  if (!gate.enabled) return null;
  const run = async () => {
    if (working.current || !gate.enabled) return;
    const uid = gate.uid;
    const version = generation.current;
    const current = () => scope.current === uid && generation.current === version;
    working.current = true; setBusy(true); onProgress('קורא את המתווכים שממתינים לאימות…');
    try {
      // Fresh complete list, independent of the current search or rendered cards.
      const { data, error } = await supabase.functions.invoke('admin-broker-contact', { body: { action: 'list' } });
      if (!current()) return;
      if (error || data?.error || !Array.isArray(data?.brokers)) throw new Error('לא ניתן לקרוא את רשימת המתווכים');
      const outcome = await recheckRedBrokers(data.brokers as RegistryTarget[], async (row, license) => {
        const response = await supabase.functions.invoke('admin-broker-registry-name', { body: { user_id: row.user_id, license_number: license } });
        if (!current()) return false;
        if (response.error || response.data?.found === false) return false;
        const profile = response.data?.profile;
        if (!profile || profile.id !== row.user_id || profile.broker_license_number !== license) return false;
        // Only the exact successfully saved server response updates its row. Avoid rereading the entire queue per check.
        qc.setQueryData<{ brokers: RegistryTarget[] }>(['broker-contact-queue', uid], previous => previous ? { ...previous, brokers: previous.brokers.map(b => b.user_id === row.user_id ? { ...b, full_name: profile.full_name, profile_license: license, license_verified: true, ...(profile.city ? { city: profile.city } : {}) } : b) } : previous);
        return true;
      }, p => { if (current()) onProgress(registryProgressText(p)); }, current);
      if (!outcome || !current()) return;
      const text = outcome.total ? `הבדיקה הושלמה. ${registryProgressText(outcome)}` : 'אין מתווכים שמסומנים באדום';
      onProgress(text); toast.info(text);
      await Promise.all(['broker-contact-queue', 'admin-profiles', 'workspaces', 'workspace-owner-profile', 'account-identity'].map(key => qc.invalidateQueries({ queryKey: [key] })));
    } catch (error) { if (current()) { const text = error instanceof Error ? error.message : 'הבדיקה נכשלה'; onProgress(text); toast.error(text); } }
    finally { if (current()) { working.current = false; setBusy(false); } }
  };
  const label = 'אימות מחדש מול המאגר הלאומי לכל המסומנים באדום';
  return <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="shrink-0 text-destructive" aria-label={label} aria-busy={busy} disabled={busy} onClick={() => void run()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}