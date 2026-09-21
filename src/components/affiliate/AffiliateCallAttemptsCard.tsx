import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Phone, PlayCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

type Attempt = {
  id: string;
  created_at: string;
  status: string | null;
  needs_callback: boolean | null;
  callback_reason: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  address: string | null;
  recording_url: string | null;
  transcript_text: string | null;
  summary: string | null;
  duration_seconds: number | null;
};

type Enrichment = {
  whatsapp_transcript?: { at: string; from: string | null; channel: string | null; text: string | null }[];
  calls?: { at: string; status: string | null; recording_url: string | null; transcript: string | null; summary: string | null; failure_reason: string | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'בהמתנה לחיוג',
  in_progress: 'בשיחה',
  completed: 'הושלמה',
  failed: 'נכשלה',
};

/**
 * Automated AI callbacks for contacts this partner brought in.
 *
 * Visitors never see a call failure. Every failed attempt lands here with two
 * ways out: run the AI call again, or dial the contact manually.
 */
export default function AffiliateCallAttemptsCard() {
  const queryClient = useQueryClient();
  const [openLead, setOpenLead] = useState<Attempt | null>(null);

  const { data: attempts = [], isLoading } = useQuery({
    queryKey: ['affiliate-call-attempts'],
    queryFn: async (): Promise<Attempt[]> => {
      const { data, error } = await supabase.rpc('get_affiliate_call_attempts');
      if (error) throw error;
      return (data ?? []) as Attempt[];
    },
  });

  const { data: enrichment } = useQuery({
    queryKey: ['lead-enrichment', openLead?.lead_id],
    enabled: !!openLead?.lead_id,
    queryFn: async (): Promise<Enrichment> => {
      const { data, error } = await supabase.rpc('get_lead_enrichment', { _lead_id: openLead!.lead_id! });
      if (error) throw error;
      return (data ?? {}) as Enrichment;
    },
  });

  const retry = useMutation({
    mutationFn: async (attemptId: string) => {
      const { data, error } = await supabase.functions.invoke('retry-ai-call', { body: { attempt_id: attemptId } });
      if (error) throw error;
      return data as { success?: boolean; error?: string | null };
    },
    onSuccess: (result) => {
      if (result?.success) toast.success('השיחה האוטומטית הופעלה מחדש');
      else toast.error(`השיחה האוטומטית נכשלה שוב: ${result?.error ?? 'שירות השיחות אינו זמין'}`);
      void queryClient.invalidateQueries({ queryKey: ['affiliate-call-attempts'] });
    },
    onError: () => toast.error('לא הצלחנו להפעיל את השיחה מחדש'),
  });

  const failures = useMemo(() => attempts.filter((row) => row.status === 'failed' || row.needs_callback === true), [attempts]);
  if (isLoading) return null;
  if (attempts.length === 0) return null;

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Phone className="h-4 w-4 text-sky-600" />
            שיחות אוטומטיות לאנשי קשר שהבאתם
            {failures.length > 0 && (
              <Badge variant="destructive" className="ms-1">{failures.length} נכשלו</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {attempts.slice(0, 12).map((row) => {
            const failed = row.status === 'failed' || row.needs_callback === true;
            return (
              <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-slate-900">
                    {row.lead_name || 'איש קשר'} · {row.lead_phone}
                  </div>
                  <div className="truncate text-[12px] text-slate-500">
                    {row.address || '—'} · {new Date(row.created_at).toLocaleString('he-IL')}
                  </div>
                  {failed && row.callback_reason && (
                    <div className="flex items-center gap-1 text-[12px] font-medium text-rose-600">
                      <AlertTriangle className="h-3 w-3" />{row.callback_reason}
                    </div>
                  )}
                </div>
                <Badge variant={failed ? 'destructive' : 'secondary'}>
                  {STATUS_LABEL[String(row.status ?? '')] ?? row.status ?? '—'}
                </Badge>
                {row.recording_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={row.recording_url} target="_blank" rel="noreferrer"><PlayCircle className="h-4 w-4" />הקלטה</a>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setOpenLead(row)}>תמלול</Button>
                {failed && (
                  <>
                    <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
                      {retry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      שיחת AI מחדש
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${row.lead_phone ?? ''}`}><Phone className="h-4 w-4" />חיוג ידני</a>
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!openLead} onOpenChange={(open) => !open && setOpenLead(null)}>
        <DialogContent dir="rtl" className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-right">{openLead?.lead_name || 'איש קשר'}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-[13px]">
            <div>
              <div className="mb-1 font-bold text-slate-900">שיחת ווטסאפ</div>
              {(enrichment?.whatsapp_transcript ?? []).length === 0 ? (
                <p className="text-slate-500">אין שיחת ווטסאפ.</p>
              ) : (
                <div className="space-y-1">
                  {(enrichment?.whatsapp_transcript ?? []).map((line, index) => (
                    <p key={index} className="text-slate-700">
                      <span className="font-semibold">{line.from === 'voter' ? 'איש הקשר' : 'ריטה'}: </span>{line.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 font-bold text-slate-900">שיחות טלפון</div>
              {(enrichment?.calls ?? []).length === 0 ? (
                <p className="text-slate-500">אין שיחות טלפון.</p>
              ) : (
                (enrichment?.calls ?? []).map((call, index) => (
                  <div key={index} className="space-y-1 border-t border-slate-100 pt-2">
                    <div className="text-slate-500">{new Date(call.at).toLocaleString('he-IL')} · {STATUS_LABEL[String(call.status ?? '')] ?? call.status}</div>
                    {call.recording_url && <a className="text-sky-600 underline" href={call.recording_url} target="_blank" rel="noreferrer">האזנה להקלטה</a>}
                    {call.summary && <p className="text-slate-700">{call.summary}</p>}
                    {call.transcript && <p className="whitespace-pre-wrap text-slate-600">{call.transcript}</p>}
                    {call.failure_reason && <p className="text-rose-600">{call.failure_reason}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
