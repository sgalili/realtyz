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

  const test = async () => {
    setTesting(true);
    // Fall back to the stored token (field shows the masked "(שמור)" placeholder),
    // re-reading it from the workspace settings if it isn't cached yet.
    let effectiveToken = token.trim() || savedToken;
    if (!effectiveToken && ownerId) {
      const { data: row } = await supabase
        .from('workspace_sms_settings')
        .select('token, username')
        .eq('workspace_owner_id', ownerId)
        .maybeSingle();
      effectiveToken = String((row as any)?.token ?? '').trim();
      if (effectiveToken) setSavedToken(effectiveToken);
    }
    if (!username.trim() || !effectiveToken) {
      setTesting(false);
      toast.error('נדרשים שם משתמש 019 וטוקן שמור לפני בדיקה');
      return;
    }
    const { data, error } = await supabase.functions.invoke('test-sms-connection', {
      body: { user: username.trim(), token: effectiveToken },
    });
    setTesting(false);
    if (error || (data as any)?.success === false) {
      toast.error('בדיקת 019 נכשלה', { description: (data as any)?.error ?? error?.message });
      return;
    }
    toast.success(`חיבור 019 תקין · יתרה ${(data as any)?.credit ?? '—'}`);
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
