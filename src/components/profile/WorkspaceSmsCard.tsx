import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * Per-workspace 019 SMS gateway credentials. Each workspace sends OTP and SMS
 * from its OWN 019 number — nothing is shared between workspaces.
 *
 * 019 authenticates with a username + API TOKEN generated on their website
 * (the old API password was retired).
 */
/** True for a masked placeholder ("••••", "(שמור)") that is not a real token. */
function isMaskedValue(v: string): boolean {
  if (!v) return false;
  return /[•*]/.test(v) || v.includes('שמור');
}

export function WorkspaceSmsCard({ onStatus }: { onStatus?: (sender: string | null) => void }) {
  const ownerId = useActiveWorkspaceOwnerId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  // Token already stored for this workspace — used when the field shows the masked
  // placeholder so "בדיקה" works without retyping the token.
  const [savedToken, setSavedToken] = useState('');
  const [sender, setSender] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!ownerId) { setLoading(false); return; }
      const { data } = await supabase
        .from('workspace_sms_settings')
        .select('username, sender_id, token')
        .eq('workspace_owner_id', ownerId)
        .maybeSingle();
      if (cancelled) return;
      setUsername(String((data as any)?.username ?? ''));
      setSender(String((data as any)?.sender_id ?? ''));
      setSavedToken(String((data as any)?.token ?? '').trim());
      setHasToken(!!String((data as any)?.token ?? '').trim());
      onStatus?.(((data as any)?.sender_id as string) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const save = async () => {
    if (!ownerId) return;
    if (!username.trim() || !sender.trim()) {
      toast.error('נדרשים שם משתמש 019 ומספר שולח מאושר');
      return;
    }
    if (!hasToken && !token.trim()) {
      toast.error('נדרש טוקן API של 019 (נוצר באתר של 019)');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      workspace_owner_id: ownerId,
      provider: '019',
      username: username.trim(),
      sender_id: sender.trim(),
      is_active: true,
    };
    if (token.trim()) payload.token = token.trim();
    const { error } = await supabase
      .from('workspace_sms_settings')
      .upsert(payload as any, { onConflict: 'workspace_owner_id' });
    setSaving(false);
    if (error) {
      toast.error('שמירת הגדרות 019 נכשלה', { description: error.message });
      return;
    }
    if (token.trim()) { setSavedToken(token.trim()); setHasToken(true); }
    setToken('');
    onStatus?.(sender.trim());
    toast.success('מספר ה-019 של מרחב העבודה נשמר');
  };

  /**
   * The token is NEVER sent from the browser: the backend resolves this
   * workspace's own 019 credentials, so the masked "(שמור)" placeholder can
   * never reach 019. `send=true` also dispatches a real test SMS.
   */
  const runTest = async (send: boolean) => {
    if (testing) return;
    // Unsaved edits must be stored first, otherwise the backend tests old creds.
    const typed = token.trim();
    if ((typed && !isMaskedValue(typed)) || !hasToken) {
      if (!savedToken && !typed) {
        toast.error('נדרש טוקן API של 019 לפני בדיקה', { description: 'הדביקו את הטוקן, לחצו שמירה ואז בדיקה.' });
        return;
      }
    }
    setTesting(true);
    const tId = toast.loading(send ? 'שולח SMS בדיקה דרך 019...' : 'בודק חיבור 019...');
    try {
      const { data, error } = await supabase.functions.invoke('test-sms-connection', {
        body: { mode: send ? 'send' : 'balance', workspace_owner_id: ownerId ?? undefined },
      });
      const resp = (data ?? {}) as {
        success?: boolean; credit?: string; error?: string; sender?: string | null;
        username?: string; scope?: string; sent_to?: string; message_id?: string | null;
      };
      if (error || resp.success !== true) {
        toast.error(send ? 'שליחת SMS הבדיקה נכשלה' : 'בדיקת 019 נכשלה', {
          id: tId,
          description: resp.error ?? error?.message ?? 'לא התקבלה תשובה מ-019',
          duration: 10000,
        });
        return;
      }
      const scopeNote = resp.scope === 'platform' ? ' · חשבון 019 של המערכת' : '';
      toast.success(send ? 'SMS הבדיקה נשלח' : 'חיבור 019 תקין', {
        id: tId,
        description: send
          ? `תשובת 019: נשלח ל-${resp.sent_to ?? '—'} · יתרה ${resp.credit ?? '—'} הודעות${scopeNote}`
          : `תשובת 019: יתרה ${resp.credit ?? '—'} הודעות · משתמש ${resp.username ?? username}${scopeNote}`,
        duration: 8000,
      });
    } catch (e: any) {
      toast.error('בדיקת 019 נכשלה', { id: tId, description: e?.message ?? 'שגיאה לא צפויה' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div dir="rtl" className="space-y-3 text-right">
      <p className="text-xs text-muted-foreground">
        חשבון ה-019 של מרחב העבודה הזה. ממנו נשלחות הודעות SMS וקודי אימות, בנפרד מכל מרחב עבודה אחר.
        האימות מתבצע בשם משתמש ובטוקן API שנוצר באתר של 019.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="sms019-user">שם משתמש</Label>
          <Input id="sms019-user" value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sms019-token">טוקן API</Label>
          <Input
            id="sms019-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? '•••••••• (שמור)' : 'הדבק טוקן מאתר 019'}
            dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sms019-sender">מספר שולח מאושר</Label>
          <Input id="sms019-sender" value={sender} onChange={(e) => setSender(e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          שמירה
        </Button>
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          בדיקה
        </Button>
      </div>
    </div>
  );
}

export default WorkspaceSmsCard;
