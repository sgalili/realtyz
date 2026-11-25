import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';
import { ScannerActionConfirm } from './ScannerActionConfirm';
export type RegistryBatch = { id: string; status: 'running' | 'completed' | 'cancelled'; total: number; done: number; verified: number };
export const registryProgressText = (p: { done: number; total: number }) => `אימות רישיונות: ${p.done}/${p.total}`;
export function BulkBrokerRegistryRecheck({ onProgress }: { onProgress: (text: string) => void }) {
  const gate = useSuperAdminGate(); const qc = useQueryClient(); const [confirm, setConfirm] = useState<'start' | 'cancel' | null>(null);
  const scope = useRef(''); scope.current = gate.enabled ? gate.uid : '';
  const key = ['broker-registry-batch', gate.uid];
  const status = useQuery({ queryKey: key, enabled: gate.enabled, retry: false, queryFn: () => brokerWhatsAppRequest<{ batch: RegistryBatch | null }>('admin-broker-registry-batch', { action: 'status' }), refetchInterval: q => q.state.error || q.state.data?.batch?.status === 'running' ? 5000 : 15000 });
  const batch = status.data?.batch;
  useEffect(() => { onProgress(batch ? registryProgressText(batch) : 'אימות רישיונות: 0/0'); if (batch) { void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-gender-remaining'] }); } }, [batch?.id, batch?.done, batch?.total, batch?.status, onProgress, qc]);
  const action = useMutation({ mutationFn: async (mode: 'start' | 'cancel') => { const uid = scope.current; const data = await brokerWhatsAppRequest<{ batch: RegistryBatch | null }>('admin-broker-registry-batch', mode === 'start' ? { action: 'start', confirmed: true } : { action: 'cancel', batch_id: batch?.id, confirmed: true }); return { uid, data }; }, onSuccess: ({ uid, data }, mode) => { if (!uid || scope.current !== uid) return; qc.setQueryData(['broker-registry-batch', uid], data); setConfirm(null); toast.success(mode === 'start' ? data.batch?.total ? 'האימות התחיל וימשיך ברקע' : 'אין מתווכים שמסומנים באדום' : 'האימות בוטל. התוצאות שכבר נשמרו יישארו'); void qc.invalidateQueries({ queryKey: ['broker-registry-batch', uid] }); }, onError: (error: Error) => { if (scope.current) toast.error(error.message); } });
  useEffect(() => { scope.current = gate.enabled ? gate.uid : ''; setConfirm(null); return () => { scope.current = ''; }; }, [gate.uid, gate.enabled]);
  if (!gate.enabled) return null;
  const running = batch?.status === 'running';
  const label = running ? 'עצירת אימות מול המאגר הלאומי' : 'אימות מחדש מול המאגר הלאומי לכל המסומנים באדום';
  return <><Button size="icon" variant="ghost" className="shrink-0 text-destructive" aria-label={label} title={label} disabled={status.isLoading || action.isPending} onClick={() => setConfirm(running ? 'cancel' : 'start')}>{action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <Square className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}</Button><ScannerActionConfirm open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }} title={confirm === 'cancel' ? 'עצירת אימות הרישיונות' : 'אימות מול המאגר הלאומי'} description={confirm === 'cancel' ? 'לבטל את יתרת האימות? התוצאות שכבר נשמרו לא יימחקו.' : 'לבדוק את כל המתווכים הממתינים שמסומנים באדום? האימות ימשיך ברקע גם לאחר יציאה מהאתר.'} confirmLabel={confirm === 'cancel' ? 'עצירת האימות' : 'התחלת האימות'} pending={action.isPending} onConfirm={() => { if (confirm) action.mutate(confirm); }} /></>;
}