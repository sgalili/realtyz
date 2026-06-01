import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save, Loader2, CheckCircle2 } from 'lucide-react';

/**
 * Quick-update card for Green API WhatsApp gateway credentials.
 * Lives on /profile so the account owner can rotate the WA Instance
 * without diving into the full Settings → API page.
 */
export function WhatsAppGatewayCard() {
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'ok' | 'err'>('unknown');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('manage-api-configs', { method: 'GET' });
        if (error) throw error;
        const row = (data as any[])?.find((r) => r.service_name === 'Green API');
        if (row?.api_key) {
          const parts = String(row.api_key).split(':');
          setInstanceId(parts[0] ?? '');
          setToken(parts.slice(1).join(':'));
        }
      } catch (e: any) {
        // silent; user will just enter fresh values
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא Instance ID ו-API Token');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: {
          service_name: 'Green API',
          api_key: `${instanceId.trim()}:${token.trim()}`,
          is_active: true,
        },
      });
      if (error) throw error;
      toast.success('פרטי WhatsApp נשמרו');
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast.error('יש למלא קודם Instance ID ו-API Token');
      return;
    }
    setTesting(true);
    setStatus('unknown');
    try {
      const res = await fetch(
        `https://api.green-api.com/waInstance${instanceId.trim()}/getStateInstance/${token.trim()}`,
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.stateInstance === 'authorized') {
        setStatus('ok');
        toast.success('✅ חיבור Green API תקין');
      } else {
        setStatus('err');
        toast.error(`חיבור נכשל: ${data?.stateInstance ?? res.status}`);
      }
    } catch (e: any) {
      setStatus('err');
      toast.error(`בדיקה נכשלה: ${e?.message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right flex items-center gap-2 justify-end">
          {status === 'ok' && (
            <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> פעיל
            </Badge>
          )}
          <span>חיבור WhatsApp (Green API)</span>
          <MessageCircle className="h-5 w-5 text-emerald-600" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground text-right">
          עדכון מהיר של אישורי ה-Instance של WhatsApp לחשבון זה. הערכים נשמרים מוצפנים בלוח הבקרה.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="wa-instance" className="text-right block">Instance ID</Label>
          <Input
            id="wa-instance"
            dir="ltr"
            placeholder="1101234567"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wa-token" className="text-right block">API Token</Label>
          <Input
            id="wa-token"
            dir="ltr"
            type="password"
            placeholder="••••••••••••••••"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={test} disabled={testing || loading}>
            {testing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            בדיקת חיבור
          </Button>
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            שמירה
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default WhatsAppGatewayCard;
