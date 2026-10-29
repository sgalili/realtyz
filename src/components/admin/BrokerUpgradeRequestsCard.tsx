import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';

type Req = { id: string; user_id: string; license_number: string; registry_holder_name: string | null; certificate_name: string | null; created_at: string };

/** Super Admin queue: approve/reject pending broker upgrade requests (server re-checks super_admin). */
export function BrokerUpgradeRequestsCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-broker-upgrade-requests'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('broker_upgrade_requests').select('id,user_id,license_number,registry_holder_name,certificate_name,created_at').eq('status', 'pending').order('created_at');
      if (error) throw error;
      const rows = (data ?? []) as Req[];
      const ids = rows.map(r => r.user_id);
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name,email').in('id', ids) : { data: [] };
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows.map(r => ({ ...r, profile: byId.get(r.user_id) as { full_name?: string; email?: string } | undefined }));
    },
  });
  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc('review_broker_upgrade_request' as any, { _id: id, _approve: approve });
      if (error) throw error;
      toast.success(approve ? 'החשבון שודרג למתווך מורשה' : 'הבקשה נדחתה');
      await qc.invalidateQueries({ queryKey: ['admin-broker-upgrade-requests'] });
    } catch (e: any) { toast.error('הפעולה נכשלה: ' + (e?.message ?? '')); }
    finally { setBusy(null); }
  };
  return <Card dir="rtl">
    <CardHeader><CardTitle className="text-right">בקשות שדרוג למתווך מורשה ({data.length})</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {isLoading ? <p className="text-muted-foreground">טוען…</p> : data.length === 0 ? <p className="text-muted-foreground">אין בקשות ממתינות.</p> : data.map(r => (
        <div key={r.id} className="space-y-2 rounded-md border border-border p-3 text-right">
          <p className="font-semibold">{r.profile?.full_name || r.profile?.email || r.user_id}</p>
          <p className="text-sm">רישיון <span dir="ltr" className="tabular-nums">{r.license_number}</span> · שם בפנקס: {r.registry_holder_name ?? '—'} · שם בתעודה: {r.certificate_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</p>
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void review(r.id, false)}>דחייה</Button>
            <Button size="sm" disabled={busy === r.id} onClick={() => void review(r.id, true)}>אישור ושדרוג</Button>
          </div>
        </div>
      ))}
    </CardContent>
  </Card>;
}
