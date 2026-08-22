import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, Eye, EyeOff, Loader2, Save, Share2 } from 'lucide-react';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Ayrshare credentials card for the /profile → "חיבורים" tab.
 * Lets the agent plug in a new Ayrshare account (API key + profile key)
 * and verify it instantly against the live Ayrshare account.
 */
export function AyrshareCredentialsCard() {
  const [apiKey, setApiKey] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<string[]>([]);
  const [status, setStatus] = useState<'unknown' | 'ok' | 'err'>('unknown');

  useEffect(() => {
    (async () => {
      try {
        const [{ data: configs }, { data: ws }] = await Promise.all([
          supabase.functions.invoke('manage-api-configs', { method: 'GET' }),
          supabase
            .from('workspace_social_profile')
            .select('ayrshare_profile_key')
            .eq('id', WORKSPACE_ID)
            .maybeSingle(),
        ]);
        const row = (configs as any[])?.find((r) => r.service_name === 'Ayrshare');
        if (row?.api_key) setApiKey(String(row.api_key));
        if (ws?.ayrshare_profile_key) setProfileKey(ws.ayrshare_profile_key);
      } catch {
        /* silent — the agent can simply type fresh values */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!apiKey.trim()) {
      toast.error('יש להזין מפתח API של Ayrshare');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: { service_name: 'Ayrshare', api_key: apiKey.trim(), is_active: true },
      });
      if (error) throw error;
      if (profileKey.trim()) {
        await supabase
          .from('workspace_social_profile')
          .upsert(
            { id: WORKSPACE_ID, ayrshare_profile_key: profileKey.trim() },
            { onConflict: 'id' },
          );
      }
      toast.success('פרטי Ayrshare נשמרו');
      await test(true);
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const test = async (silent = false) => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-status', {
        method: 'GET',
      });
      if (error) throw error;
      const list: string[] = ((data as any)?.connected ?? [])
        .map((a: any) => String(a?.platform ?? a?.displayName ?? a).toLowerCase())
        .filter(Boolean);
      setConnected(list);
      setStatus('ok');
      if (!silent) {
        toast.success(
          list.length
            ? `חיבור Ayrshare תקין · ${list.length} ערוצים מחוברים`
            : 'חיבור Ayrshare תקין · אין ערוצים מחוברים עדיין',
        );
      }
    } catch (e: any) {
      setStatus('err');
      if (!silent) toast.error(`בדיקת החיבור נכשלה: ${e?.message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card dir="rtl" className="border-blue-200 text-right">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-5 w-5 text-blue-600" />
          <span>ניהול Ayrshare (רשתות חברתיות)</span>
          {status === 'ok' && (
            <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> פעיל
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          חיבור חשבון Ayrshare לפרסום ולניהול הערוצים החברתיים של המשרד.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ayr-key" className="block text-right">מפתח API</Label>
          <div className="flex items-center gap-2">
            <Input
              id="ayr-key"
              dir="ltr"
              type={showKey ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowKey((v) => !v)}
              title={showKey ? 'הסתר' : 'הצג'}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ayr-profile" className="block text-right">Profile Key (מפתח פרופיל)</Label>
          <Input
            id="ayr-profile"
            dir="ltr"
            placeholder="XXXX-XXXX-XXXX"
            value={profileKey}
            onChange={(e) => setProfileKey(e.target.value)}
            disabled={loading}
          />
        </div>

        {connected.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {connected.map((p) => (
              <Badge key={p} variant="secondary" className="text-[11px]">{p}</Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => test(false)}
            disabled={testing || loading}
            className="px-2 text-xs"
          >
            {testing ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : null}
            בדיקת חיבור
          </Button>
          <Button size="sm" onClick={save} disabled={saving || loading} className="px-2 text-xs">
            {saving ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="ml-1 h-3.5 w-3.5" />
            )}
            שמירה
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default AyrshareCredentialsCard;
