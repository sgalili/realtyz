import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const ERR: Record<string, string> = { wrong_code: 'קוד שגוי', code_expired: 'הקוד פג תוקף, שלחו קוד חדש', send_failed: 'שליחת הקוד נכשלה', super_admin_cannot_self_delete: 'לא ניתן למחוק חשבון מנהל על' };

/** Icon-only permanent account deletion with WhatsApp + email code confirmation. */
export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('account-self-delete', { body });
    const ctx = (error as { context?: Response } | null)?.context;
    const payload = data ?? (ctx ? await ctx.json().catch(() => ({})) : {});
    if (payload?.error || error) throw new Error(ERR[payload?.error] ?? 'הפעולה נכשלה');
    return payload;
  };
  const send = async () => {
    setBusy(true);
    try { await call({ action: 'send' }); setSent(true); toast.success('קוד נשלח בוואטסאפ ובמייל'); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { await call({ action: 'confirm', code }); await supabase.auth.signOut(); window.location.href = '/'; }
    catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return <>
    <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10" aria-label="מחיקת החשבון" title="מחיקת החשבון" onClick={() => { setOpen(true); setSent(false); setCode(''); }}>
      <Trash2 className="h-4 w-4" />
    </Button>
    <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
      <DialogContent dir="rtl" className="max-w-sm text-right">
        <DialogHeader className="text-right">
          <DialogTitle>מחיקת החשבון לצמיתות</DialogTitle>
          <DialogDescription>המחיקה סופית ולא ניתנת לביטול. כל הנתונים שלכם יימחקו. לאישור נשלח קוד בוואטסאפ ובמייל.</DialogDescription>
        </DialogHeader>
        {sent && <Input inputMode="numeric" dir="ltr" maxLength={6} placeholder="קוד אימות" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}
        <div className="flex gap-2">
          {sent
            ? <Button variant="destructive" className="flex-1" disabled={busy || code.length < 4} onClick={() => void confirm()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}מחיקה סופית</Button>
            : <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => void send()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}שליחת קוד</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
