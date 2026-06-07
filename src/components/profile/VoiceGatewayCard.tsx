import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Phone, Save, Loader2, PlugZap } from 'lucide-react';

/**
 * Voice & IVR gateway credentials (Vapi + Twilio).
 * Stored in `api_configs` via manage-api-configs edge fn under
 * service_name = 'Vapi' and 'Twilio'. api_key holds a colon-joined
 * payload that the corresponding edge function knows how to split.
 *
 * Vapi:    api_key = `${VAPI_API_KEY}:${VAPI_PHONE_NUMBER_ID}:${VAPI_ASSISTANT_ID}`
 * Twilio:  api_key = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}:${TWILIO_PHONE_NUMBER}`
 */
export function VoiceGatewayCard() {
  // Vapi
  const [vapiKey, setVapiKey] = useState('');
  const [vapiPhoneId, setVapiPhoneId] = useState('');
  const [vapiAssistantId, setVapiAssistantId] = useState('');
  // Twilio
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioNumber, setTwilioNumber] = useState('');

  const [loading, setLoading] = useState(true);
  const [savingVapi, setSavingVapi] = useState(false);
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('vapi-verify-credentials', { method: 'POST' });
      if (error) throw error;
      const v: any = (data as any)?.vapi ?? {};
      const t: any = (data as any)?.twilio ?? {};
      if (v.ok) toast.success(`Vapi: ${v.message}`); else toast.error(`Vapi: ${v.message || 'שגיאת התחברות - בדוק את מפתחות ה-API שלך'}`);
      if (t.ok) toast.success(`Twilio: ${t.message}`); else toast.error(`Twilio: ${t.message || 'שגיאת התחברות - בדוק את מפתחות ה-API שלך'}`);
    } catch (e: any) {
      toast.error(`שגיאת התחברות - בדוק את מפתחות ה-API שלך`);
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('manage-api-configs', { method: 'GET' });
        if (error) throw error;
        const rows = (data as any[]) || [];
        const vapi = rows.find((r) => r.service_name === 'Vapi');
        if (vapi?.api_key) {
          const [k, p, a] = String(vapi.api_key).split(':');
          setVapiKey(k ?? ''); setVapiPhoneId(p ?? ''); setVapiAssistantId(a ?? '');
        }
        const tw = rows.find((r) => r.service_name === 'Twilio');
        if (tw?.api_key) {
          const [s, t, n] = String(tw.api_key).split(':');
          setTwilioSid(s ?? ''); setTwilioToken(t ?? ''); setTwilioNumber(n ?? '');
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveVapi = async () => {
    if (!vapiKey.trim()) { toast.error('יש למלא Vapi API Key'); return; }
    setSavingVapi(true);
    try {
      const { error } = await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: {
          service_name: 'Vapi',
          api_key: `${vapiKey.trim()}:${vapiPhoneId.trim()}:${vapiAssistantId.trim()}`,
          is_active: true,
        },
      });
      if (error) throw error;
      toast.success('פרטי Vapi נשמרו');
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSavingVapi(false);
    }
  };

  const saveTwilio = async () => {
    if (!twilioSid.trim() || !twilioToken.trim()) {
      toast.error('יש למלא Account SID ו-Auth Token');
      return;
    }
    setSavingTwilio(true);
    try {
      const { error } = await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: {
          service_name: 'Twilio',
          api_key: `${twilioSid.trim()}:${twilioToken.trim()}:${twilioNumber.trim()}`,
          is_active: true,
        },
      });
      if (error) throw error;
      toast.success('פרטי Twilio נשמרו');
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSavingTwilio(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right flex items-center gap-2 justify-end">
          <span>שיחות טלפון</span>
          <Phone className="h-5 w-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vapi block */}
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="text-sm font-semibold text-right">Vapi · AI Voice</div>

          <div className="space-y-1.5">
            <Label htmlFor="vapi-key" className="text-right block">Vapi API Key</Label>
            <Input id="vapi-key" dir="ltr" type="password" placeholder="vapi_••••••••"
              value={vapiKey} onChange={(e) => setVapiKey(e.target.value)} disabled={loading} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vapi-phone" className="text-right block">Phone Number ID</Label>
              <Input id="vapi-phone" dir="ltr" placeholder="ph_xxxx"
                value={vapiPhoneId} onChange={(e) => setVapiPhoneId(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vapi-assistant" className="text-right block">Assistant ID</Label>
              <Input id="vapi-assistant" dir="ltr" placeholder="asst_xxxx"
                value={vapiAssistantId} onChange={(e) => setVapiAssistantId(e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button size="sm" variant="outline" onClick={testConnection} disabled={testing || loading}>
              {testing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PlugZap className="ml-2 h-4 w-4" />}
              בדוק חיבור
            </Button>
            <Button size="sm" onClick={saveVapi} disabled={savingVapi || loading}>
              {savingVapi ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              שמור Vapi
            </Button>
          </div>
        </div>

        {/* Twilio block */}
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="text-sm font-semibold text-right">Twilio · מספרים ו-IVR</div>

          <div className="space-y-1.5">
            <Label htmlFor="tw-sid" className="text-right block">Account SID</Label>
            <Input id="tw-sid" dir="ltr" placeholder="ACxxxxxxxxxxxxxxxx"
              value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} disabled={loading} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tw-token" className="text-right block">Auth Token</Label>
            <Input id="tw-token" dir="ltr" type="password" placeholder="••••••••••••••••"
              value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} disabled={loading} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tw-number" className="text-right block">Twilio Phone Number</Label>
            <Input id="tw-number" dir="ltr" placeholder="+972XXXXXXXXX"
              value={twilioNumber} onChange={(e) => setTwilioNumber(e.target.value)} disabled={loading} />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={saveTwilio} disabled={savingTwilio || loading}>
              {savingTwilio ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              שמור Twilio
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default VoiceGatewayCard;
