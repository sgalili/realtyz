import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useUserRole } from '@/hooks/useUserRole';

const STATUS: Record<string, string> = {
  received: 'התקבלה', initial_review: 'בבדיקה ראשונית', upheld: 'התקבלה – הוחזר', rejected: 'נדחתה',
  appealed: 'בערעור', appeal_upheld: 'ערעור: התקבלה', appeal_rejected: 'ערעור: נדחתה',
};
const REASONS = ['פרטים שגויים / מספר לא תקין', 'פנייה כפולה', 'לא מתעניין אמיתי', 'ספאם או פנייה אוטומטית', 'אחר'];
const d = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '');

type Dispute = { id: string; charge_id: string; status: string; reason: string; created_at: string; initial_check_due: string; decision_due: string; appeal_deadline: string | null; decision_note: string | null; appeal_note: string | null; affiliate_id: string | null; decided_by: string | null; opened_by: string };
type Charge = { id: string; listing_id: string; tier: number; gross: number; created_at: string; dispute_status: string | null; is_leftover: boolean };
type Action = { kind: 'open'; charge: Charge } | { kind: 'appeal' | 'decide' | 'appeal_decide'; dispute: Dispute };

/** Advertiser dispute + appeal workflow, plus staff review queue. */
export default function LeadDisputesPanel() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { isAdmin, isModerator, isSuperAdmin } = useUserRole();
  const qc = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const isStaff = isAdmin || isModerator || isSuperAdmin;

  const charges = useQuery({
    queryKey: ['dispute-charges', activeWorkspaceId], enabled: !!activeWorkspaceId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data, error } = await supabase.from('listing_lead_charges').select('id, listing_id, tier, gross, created_at, dispute_status, is_leftover').eq('workspace_owner_id', activeWorkspaceId!).gte('created_at', since).order('created_at', { ascending: false }).limit(50);
      if (error) throw error; return (data ?? []) as Charge[];
    },
  });
  const disputes = useQuery({
    queryKey: ['lead-disputes', user?.id, activeWorkspaceId], enabled: !!user?.id, refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await supabase.from('lead_disputes').select('*').order('created_at', { ascending: false }).limit(100); if (error) throw error; return (data ?? []) as Dispute[]; },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['dispute-charges'] }); void qc.invalidateQueries({ queryKey: ['lead-disputes'] }); void qc.invalidateQueries({ queryKey: ['transparency'] }); };

  const run = async (upheld?: boolean) => {
    if (!action) return;
    setBusy(true);
    let res;
    if (action.kind === 'open') res = await supabase.rpc('open_lead_dispute', { _charge_id: action.charge.id, _reason: reason, _details: text || null });
    else if (action.kind === 'appeal') res = await supabase.rpc('appeal_lead_dispute', { _id: action.dispute.id, _reason: text });
    else if (action.kind === 'decide') res = await supabase.rpc('decide_lead_dispute', { _id: action.dispute.id, _upheld: !!upheld, _note: text });
    else res = await supabase.rpc('decide_lead_appeal', { _id: action.dispute.id, _upheld: !!upheld, _note: text });
    setBusy(false);
    if (res.error) { toast.error(res.error.message.includes('neutral') ? 'הערעור חייב להיבדק על ידי גורם ניטרלי' : res.error.message.includes('window') ? 'חלון המחלוקת (7 ימים) נסגר' : 'הפעולה נכשלה'); return; }
    toast.success('נשמר'); setAction(null); setText(''); refresh();
  };

  const disputable = (charges.data ?? []).filter((c) => !c.dispute_status && !c.is_leftover && Number(c.gross) > 0);
  const list = disputes.data ?? [];
  const staffQueue = isStaff ? list.filter((x) => ['received', 'initial_review', 'appealed'].includes(x.status)) : [];
  const mine = list.filter((x) => !staffQueue.includes(x));
  const needsText = action && action.kind !== 'open';

  return (
    <section className="space-y-3 rounded-lg border bg-card p-3">
      <h2 className="font-bold">מחלוקות על פניות</h2>
      <p className="text-xs text-muted-foreground">ניתן לערער על פנייה בתשלום עד 7 ימים מקבלתה. בדיקה ראשונית תוך 2 ימי עסקים, החלטה תוך 5 ימי עסקים, וערעור על ההחלטה תוך 7 ימים לגורם ניטרלי.</p>
      {disputable.length > 0 && <ul className="divide-y text-sm">{disputable.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span>פנייה סוג {c.tier} · ₪{Number(c.gross).toLocaleString('he-IL')} · {d(c.created_at)}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAction({ kind: 'open', charge: c }); setReason(REASONS[0]); setText(''); }}>פתיחת מחלוקת</Button></li>))}</ul>}
      {[...staffQueue, ...mine].length > 0 && <ul className="divide-y text-sm">{[...staffQueue, ...mine].map((x) => {
        const open = ['received', 'initial_review', 'appealed'].includes(x.status);
        const canAppeal = ['upheld', 'rejected'].includes(x.status) && x.appeal_deadline && new Date(x.appeal_deadline) > new Date();
        return <li key={x.id} className="space-y-1 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1 font-medium">{open && <Hourglass className="h-3.5 w-3.5 animate-pulse text-warning" />}{STATUS[x.status] ?? x.status} · {x.reason}</span>
            <div className="flex gap-1">
              {isStaff && ['received', 'initial_review'].includes(x.status) && <Button size="sm" className="h-7 text-xs" onClick={() => { setAction({ kind: 'decide', dispute: x }); setText(''); void supabase.rpc('review_lead_dispute', { _id: x.id }); }}>בדיקה והחלטה</Button>}
              {(isModerator || isSuperAdmin) && x.status === 'appealed' && user?.id !== x.decided_by && <Button size="sm" className="h-7 text-xs" onClick={() => { setAction({ kind: 'appeal_decide', dispute: x }); setText(''); }}>בדיקת ערעור</Button>}
              {canAppeal && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAction({ kind: 'appeal', dispute: x }); setText(''); }}>ערעור</Button>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">נפתחה {d(x.created_at)} · בדיקה עד {d(x.initial_check_due)} · החלטה עד {d(x.decision_due)}{x.appeal_deadline ? ` · ערעור עד ${d(x.appeal_deadline)}` : ''}</p>
          {x.decision_note && <p className="text-xs">החלטה: {x.decision_note}</p>}
          {x.appeal_note && <p className="text-xs">ערעור: {x.appeal_note}</p>}
        </li>;
      })}</ul>}
      {!disputable.length && !list.length && <p className="text-sm text-muted-foreground">אין פניות בחלון המחלוקת ואין מחלוקות פתוחות.</p>}

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-right">{action?.kind === 'open' ? 'פתיחת מחלוקת' : action?.kind === 'appeal' ? 'ערעור על החלטה' : action?.kind === 'decide' ? 'החלטה במחלוקת' : 'החלטה בערעור'}</DialogTitle></DialogHeader>
          {action?.kind === 'open' && <div className="flex flex-wrap gap-2">{REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1 text-xs ${reason === r ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>{r}</button>)}</div>}
          {(action?.kind === 'decide' || action?.kind === 'appeal_decide') && <p className="text-xs text-muted-foreground">ההחלטה מתועדת ביומן הביקורת יחד עם ראיות הסינון והפעילות.</p>}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={action?.kind === 'open' ? 'פרטים נוספים (לא חובה)' : 'נימוק (חובה)'} />
          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setAction(null)}>ביטול</Button>
            {action?.kind === 'open' || action?.kind === 'appeal'
              ? <Button disabled={busy || (needsText && !text.trim()) || false} onClick={() => void run()}>שליחה</Button>
              : <div className="flex gap-2"><Button variant="outline" disabled={busy || !text.trim()} onClick={() => void run(false)}>דחייה</Button><Button disabled={busy || !text.trim()} onClick={() => void run(true)}>קבלה והחזר</Button></div>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
