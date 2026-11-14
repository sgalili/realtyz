import { notifyLicenseStatus } from '@/lib/licenseStatusNotify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useUserRole } from '@/hooks/useUserRole';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
import { mayFetchRegistryInReview } from '@/lib/brokerProfilePolicy';
import { registryDisplayName } from '../../../supabase/functions/_shared/brokerRegistry';
import { hasNewAdminItems } from '@/lib/adminUserFilters';

type Req = { id: string; user_id: string; license_number: string; registry_holder_name: string | null; certificate_name: string | null; certificate_path: string | null; created_at: string };

/** Super Admin queue: approve/reject pending broker upgrade requests (server re-checks super_admin). */
export function BrokerUpgradeRequestsCard() {
  const { isSuperAdmin } = useUserRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [fetchedIds, setFetchedIds] = useState<string[]>([]);
  type Row = Req & { certUrl: string | null; profile?: { full_name?: string; email?: string; phone?: string } };
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['admin-broker-upgrade-requests'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('broker_upgrade_requests').select('id,user_id,license_number,registry_holder_name,certificate_name,certificate_path,created_at').eq('status', 'pending').order('created_at');
      if (error) throw error;
      const rows = (data ?? []) as Req[];
      const ids = rows.map(r => r.user_id);
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name,email,phone,locked_broker_name').in('id', ids) : { data: [] };
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const signed = await Promise.all(rows.map(async r => r.certificate_path ? (await supabase.storage.from('broker-license-docs').createSignedUrl(r.certificate_path, 3600)).data?.signedUrl ?? null : null));
      return rows.map((r, i) => ({ ...r, certUrl: signed[i], registryFetched: !!byId.get(r.user_id)?.locked_broker_name || !!r.registry_holder_name, profile: byId.get(r.user_id) as { full_name?: string; email?: string; phone?: string } | undefined }));
    },
  });
  const review = async (id: string, approve: boolean, userId?: string) => {
    setBusy(id);
    try {
      const { data, error } = await supabase.rpc('review_broker_upgrade_request' as any, { _id: id, _approve: approve });
      if (error) throw error;
      notifyLicenseStatus(userId);
      const published = (data as any)?.published ?? 0; const failed = (data as any)?.failed ?? 0;
      if (approve && failed) toast.warning(`${failed} מודעות לא פורסמו — פרטי השגיאה נשמרו במודעה`);
      toast.success(approve ? `החשבון שודרג למתווך מורשה${published ? ` · ${published} מודעות פורסמו` : ''}` : 'הבקשה נדחתה');
      await qc.invalidateQueries({ queryKey: ['admin-broker-upgrade-requests'] });
      await qc.invalidateQueries({ queryKey: ['notif-admin-pending-licenses'] });
    } catch (e: any) { toast.error('הפעולה נכשלה: ' + (e?.message ?? '')); }
    finally { setBusy(null); }
  };
  if (!isSuperAdmin) return null;
  if (isError) return <p role="alert" className="text-destructive">לא ניתן לטעון בקשות שדרוג למתווך</p>;
  if (isLoading || !hasNewAdminItems(data.length)) return null;
  return <Card dir="rtl">
    <CardHeader><CardTitle className="text-right">בקשות שדרוג למתווך מורשה ({data.length})</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {isLoading ? <p className="text-muted-foreground">טוען…</p> : data.length === 0 ? <p className="text-muted-foreground">אין בקשות ממתינות.</p> : (data as Row[]).map(r => (
        <div key={r.id} className="space-y-2 rounded-md border border-border p-3 text-right">
          <p className="font-semibold">{r.profile?.full_name || r.profile?.email || r.user_id}</p>
          <p className="text-sm">טלפון נייד: <span dir="ltr">{r.profile?.phone ? r.profile.phone.replace(/^972/, '0').replace(/^(\d{3})(\d+)$/, '$1-$2') : '—'}</span></p>
          {r.certUrl ? <a href={r.certUrl} target="_blank" rel="noopener noreferrer"><img src={r.certUrl} alt="תעודת רישיון" className="max-h-60 w-full rounded border border-border object-contain" /></a> : <p className="text-sm text-muted-foreground">לא הועלתה תמונת תעודה (אומתה אוטומטית מול התעודה בעת ההגשה)</p>}
          <p className="text-sm">רישיון <span dir="ltr" className="tabular-nums">{r.license_number}</span> · שם בפנקס: {r.registry_holder_name ? registryDisplayName(r.registry_holder_name, r.profile?.full_name) : '—'} · שם בתעודה: {r.certificate_name ?? '—'}</p>
          {mayFetchRegistryInReview({ superAdmin: isSuperAdmin, pending: true, registryHolderName: r.registry_holder_name, identityLocked: !!data.find(row => row.id === r.id)?.registryFetched || fetchedIds.includes(r.id) }) && <BrokerRegistryNameButton userId={r.user_id} license={r.license_number} disabled={busy === r.id} onUpdated={() => { setFetchedIds(ids => [...ids, r.id]); void qc.invalidateQueries({ queryKey: ['admin-broker-upgrade-requests'] }); }} />}
          <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</p>
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void review(r.id, false, r.user_id)}>דחייה</Button>
            <Button size="sm" disabled={busy === r.id} onClick={() => void review(r.id, true, r.user_id)}>אישור</Button>
          </div>
        </div>
      ))}
    </CardContent>
  </Card>;
}
