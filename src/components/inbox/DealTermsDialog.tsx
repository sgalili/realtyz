import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Handshake, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export function DealTermsDialog({ peerId, peerName, label = false }: { peerId: string; peerName: string | null; label?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState('');
  const [share, setShare] = useState('');
  const [terms, setTerms] = useState('');
  const key = ['community-deal-terms', user?.id, peerId];
  const saved = useQuery({
    queryKey: key, enabled: open && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('community_deal_terms').select('*')
        .or(`and(created_by.eq.${user!.id},peer_id.eq.${peerId}),and(created_by.eq.${peerId},peer_id.eq.${user!.id})`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const pct = share.trim() === '' ? null : Number(share);
      if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) throw new Error('אחוז לא תקין');
      const { error } = await supabase.from('community_deal_terms').insert({ created_by: user!.id, peer_id: peerId, property_reference: property.trim() || null, my_share_percent: pct, terms: terms.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('תנאי השותפות נשמרו ומתועדים בטוראף'); setProperty(''); setShare(''); setTerms(''); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message === 'אחוז לא תקין' ? 'יש להזין אחוז בין 0 ל־100' : 'שמירת התנאים נכשלה'),
  });
  return <>
    <Button size={label ? 'default' : 'icon'} variant="ghost" aria-label="שמור תנאי שותפות לעסקה זו" title="שמור תנאי שותפות לעסקה זו" onClick={() => setOpen(true)}><Handshake className="h-5 w-5" />{label && 'תנאי שותפות לעסקה'}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>שמור תנאי שותפות לעסקה זו</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">שותפות עם {peerName ?? 'חבר הקהילה'}. התנאים נשמרים בטוראף וגלויים לשני הצדדים.</p>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (terms.trim() && !save.isPending) save.mutate(); }}>
        <Input aria-label="נכס או עסקה" placeholder="נכס / עסקה (כתובת או קישור)" maxLength={300} value={property} onChange={e => setProperty(e.target.value)} />
        <Input aria-label="החלק שלי בעמלה באחוזים" placeholder="החלק שלי בעמלה (%)" inputMode="decimal" value={share} onChange={e => setShare(e.target.value)} />
        <Textarea aria-label="תנאי השותפות" placeholder="תנאי השותפות שסוכמו..." maxLength={4000} rows={4} value={terms} onChange={e => setTerms(e.target.value)} />
        <div className="flex justify-between gap-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>ביטול</Button><Button type="submit" disabled={!terms.trim() || save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}שמירה</Button></div>
      </form>
      {!!saved.data?.length && <div className="space-y-2 border-t border-border pt-3"><h3 className="font-semibold">תנאים שנשמרו</h3>
        {saved.data.map(t => <div key={t.id} className="rounded-lg border border-border p-2 text-sm">
          <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString('he-IL')} · {t.created_by === user?.id ? 'נשמר על ידך' : `נשמר על ידי ${peerName ?? 'השותף'}`}{t.property_reference ? ` · ${t.property_reference}` : ''}{t.my_share_percent != null ? ` · חלק השומר ${t.my_share_percent}%` : ''}</div>
          <p className="whitespace-pre-wrap">{t.terms}</p></div>)}</div>}
    </DialogContent></Dialog>
  </>;
}
