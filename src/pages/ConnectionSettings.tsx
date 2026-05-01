import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Eye, EyeOff, Loader2, Save, Zap, CheckCircle2, XCircle,
  MessageCircle, Phone, Home, Radio,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useDemoGuard } from '@/hooks/useDemoGuard';

type Status = 'idle' | 'testing' | 'success' | 'error';

interface ApiConfig {
  id: string;
  service_name: string;
  api_key: string;
  webhook_url: string | null;
  is_active: boolean;
  updated_at: string | null;
}

const StatusIcon = ({ status }: { status: Status }) => {
  if (status === 'testing') return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Radio className="h-4 w-4 text-muted-foreground/40" />;
};

const StatusBadge = ({ status }: { status: Status }) => {
  const map: Record<Status, { label: string; cls: string }> = {
    idle: { label: 'לא נבדק', cls: 'bg-muted text-muted-foreground' },
    testing: { label: 'בודק...', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
    success: { label: 'מחובר', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
    error: { label: 'שגיאת חיבור', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
  };
  const v = map[status];
  return <Badge variant="outline" className={`text-[10px] ${v.cls}`}>{v.label}</Badge>;
};

interface SecretFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  show: boolean;
  onToggleShow: () => void;
}

const SecretField = ({ id, label, value, onChange, placeholder, show, onToggleShow }: SecretFieldProps) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-10 font-mono text-sm"
        dir="ltr"
      />
      <button
        type="button"
        onClick={onToggleShow}
        aria-label={show ? 'הסתר' : 'הצג'}
        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  </div>
);

const ConnectionSettings = () => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const blockDemoAction = useDemoGuard();

  // Show/hide map
  const [show, setShow] = useState<Record<string, boolean>>({});
  const toggleShow = (k: string) => setShow((s) => ({ ...s, [k]: !s[k] }));

  // Saving + status
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({
    whatsapp: 'idle',
    twilio: 'idle',
    homely: 'idle',
  });

  // Fields
  const [whatsappKey, setWhatsappKey] = useState('');
  const [twilioPhone, setTwilioPhone] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [homelyKey, setHomelyKey] = useState('');
  const [homelyHasKey, setHomelyHasKey] = useState(false);

  const edgeFnBase = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/manage-api-configs`;
  const edgeFnHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  // Load existing api_configs
  const { data: configs } = useQuery({
    queryKey: ['api-configs'],
    queryFn: async () => {
      const res = await fetch(edgeFnBase, { headers: edgeFnHeaders });
      if (!res.ok) throw new Error('Failed to load configs');
      return (await res.json()) as ApiConfig[];
    },
  });

  useEffect(() => {
    if (!configs) return;
    const wa = configs.find((c) => c.service_name === 'Green API');
    if (wa?.api_key) {
      // Stored as instanceId:token — show token only as the "API Key"
      const parts = wa.api_key.split(':');
      setWhatsappKey(parts.slice(1).join(':') || wa.api_key);
    }
    const wba = configs.find((c) => c.service_name === 'WhatsApp Business');
    if (wba?.api_key) {
      const parts = wba.api_key.split(':');
      setTwilioPhone(parts[0] || '');
      setTwilioToken(parts.slice(1).join(':'));
    }
  }, [configs]);

  // Load Homely key from user_api_keys
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const { data } = await supabaseClient
        .from('user_api_keys')
        .select('homely_api_key')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (data?.homely_api_key) {
        setHomelyKey(data.homely_api_key);
        setHomelyHasKey(true);
      }
    })();
  }, [authUser]);

  // ─── Save handlers ───
  const saveConfig = async (serviceName: string, apiKey: string) => {
    const res = await fetch(edgeFnBase, {
      method: 'POST',
      headers: edgeFnHeaders,
      body: JSON.stringify({ service_name: serviceName, api_key: apiKey, is_active: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || 'Save failed');
    }
  };

  const handleSaveWhatsApp = async () => {
    if (!whatsappKey.trim()) { toast.error('יש להזין WhatsApp API Key'); return; }
    if (blockDemoAction('save-api-key')) return;
    setSaving('whatsapp');
    try {
      // Preserve existing instance ID prefix if present
      const existing = configs?.find((c) => c.service_name === 'Green API');
      const instanceId = existing?.api_key?.split(':')[0] || 'instance';
      await saveConfig('Green API', `${instanceId}:${whatsappKey.trim()}`);
      queryClient.invalidateQueries({ queryKey: ['api-configs'] });
      toast.success('✅ WhatsApp API Key נשמר');
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e as Error).message);
    } finally { setSaving(null); }
  };

  const handleSaveTwilio = async () => {
    if (!twilioPhone.trim() || !twilioToken.trim()) {
      toast.error('יש למלא Phone Number ו-Access Token'); return;
    }
    if (blockDemoAction('save-api-key')) return;
    setSaving('twilio');
    try {
      await saveConfig('WhatsApp Business', `${twilioPhone.trim()}:${twilioToken.trim()}`);
      queryClient.invalidateQueries({ queryKey: ['api-configs'] });
      toast.success('✅ פרטי Twilio / WABA נשמרו');
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e as Error).message);
    } finally { setSaving(null); }
  };

  const handleSaveHomely = async () => {
    if (!authUser) return;
    if (!homelyKey.trim()) { toast.error('יש להזין Homely API Key'); return; }
    if (blockDemoAction('save-homely-key')) return;
    setSaving('homely');
    const { error } = await supabaseClient
      .from('user_api_keys')
      .upsert(
        { user_id: authUser.id, homely_api_key: homelyKey.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    setSaving(null);
    if (error) { toast.error('שמירה נכשלה: ' + error.message); return; }
    setHomelyHasKey(true);
    toast.success('✅ Homely API Key נשמר');
  };

  // ─── Test handlers ───
  const handleTestWhatsApp = async () => {
    setStatus((s) => ({ ...s, whatsapp: 'testing' }));
    try {
      const existing = configs?.find((c) => c.service_name === 'Green API');
      const instanceId = existing?.api_key?.split(':')[0];
      const token = whatsappKey || existing?.api_key?.split(':').slice(1).join(':');
      if (!instanceId || !token || instanceId === 'instance') {
        toast.error('יש לשמור את מפתח ה-WhatsApp לפני בדיקה');
        setStatus((s) => ({ ...s, whatsapp: 'error' }));
        return;
      }
      const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/getStateInstance/${token}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as any)?.stateInstance === 'authorized') {
        toast.success('✅ חיבור WhatsApp תקין');
        setStatus((s) => ({ ...s, whatsapp: 'success' }));
      } else {
        toast.error(`❌ WhatsApp: ${(data as any)?.stateInstance || res.status}`);
        setStatus((s) => ({ ...s, whatsapp: 'error' }));
      }
    } catch (e) {
      toast.error('❌ לא ניתן להתחבר ל-WhatsApp');
      setStatus((s) => ({ ...s, whatsapp: 'error' }));
    }
  };

  const handleTestTwilio = async () => {
    setStatus((s) => ({ ...s, twilio: 'testing' }));
    try {
      if (!twilioPhone || !twilioToken) {
        toast.error('יש למלא Phone Number ו-Token');
        setStatus((s) => ({ ...s, twilio: 'error' }));
        return;
      }
      // Treat as Meta WhatsApp Business phone-id check
      const res = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(twilioPhone)}`, {
        headers: { Authorization: `Bearer ${twilioToken}` },
      });
      if (res.ok) {
        toast.success('✅ חיבור Twilio / WABA תקין');
        setStatus((s) => ({ ...s, twilio: 'success' }));
      } else {
        toast.error(`❌ WABA: קוד ${res.status}`);
        setStatus((s) => ({ ...s, twilio: 'error' }));
      }
    } catch {
      toast.error('❌ לא ניתן להתחבר ל-WABA');
      setStatus((s) => ({ ...s, twilio: 'error' }));
    }
  };

  const handleTestHomely = async () => {
    if (!homelyHasKey && !homelyKey.trim()) {
      toast.error('יש לשמור מפתח Homely לפני בדיקה');
      setStatus((s) => ({ ...s, homely: 'error' }));
      return;
    }
    setStatus((s) => ({ ...s, homely: 'testing' }));
    try {
      const { data, error } = await supabaseClient.functions.invoke('call-homely-api', {
        body: { path: '/health', method: 'GET' },
      });
      const ok = !error && !(data as any)?.error;
      if (ok) {
        toast.success('✅ חיבור Homely תקין');
        setStatus((s) => ({ ...s, homely: 'success' }));
      } else {
        toast.error(`❌ Homely: ${error?.message || (data as any)?.error || 'שגיאה'}`);
        setStatus((s) => ({ ...s, homely: 'error' }));
      }
    } catch (e) {
      toast.error('❌ לא ניתן להתחבר ל-Homely');
      setStatus((s) => ({ ...s, homely: 'error' }));
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">ערוצי תקשורת</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            ניהול חיבורי API לערוצי תקשורת חיצוניים. כל המפתחות מוצפנים ומוסתרים כברירת מחדל.
          </p>
        </header>

        {/* WhatsApp */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">WhatsApp API Key</CardTitle>
                  <CardDescription className="text-xs">מפתח Green API להודעות WhatsApp יוצאות</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={status.whatsapp} />
                <StatusBadge status={status.whatsapp} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecretField
              id="whatsapp-key"
              label="WhatsApp API Key"
              value={whatsappKey}
              onChange={setWhatsappKey}
              placeholder="הדבק את ה-API Token כאן"
              show={!!show.whatsapp}
              onToggleShow={() => toggleShow('whatsapp')}
            />
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleTestWhatsApp} disabled={status.whatsapp === 'testing'} className="gap-2">
                {status.whatsapp === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                בדיקת חיבור
              </Button>
              <Button size="sm" onClick={handleSaveWhatsApp} disabled={saving === 'whatsapp'} className="gap-2">
                {saving === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Twilio / WABA Phone */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Phone className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Twilio / WABA Phone Number</CardTitle>
                  <CardDescription className="text-xs">מספר הטלפון המאומת ב-WhatsApp Business / Twilio</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={status.twilio} />
                <StatusBadge status={status.twilio} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="twilio-phone" className="text-xs font-medium">Phone Number ID</Label>
              <Input
                id="twilio-phone"
                value={twilioPhone}
                onChange={(e) => setTwilioPhone(e.target.value)}
                placeholder="לדוגמה: 1234567890"
                className="font-mono text-sm"
                dir="ltr"
              />
            </div>
            <SecretField
              id="twilio-token"
              label="Access Token"
              value={twilioToken}
              onChange={setTwilioToken}
              placeholder="Bearer Token של Meta / Twilio"
              show={!!show.twilio}
              onToggleShow={() => toggleShow('twilio')}
            />
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleTestTwilio} disabled={status.twilio === 'testing'} className="gap-2">
                {status.twilio === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                בדיקת חיבור
              </Button>
              <Button size="sm" onClick={handleSaveTwilio} disabled={saving === 'twilio'} className="gap-2">
                {saving === 'twilio' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Homely */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Home className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Homely API Key</CardTitle>
                  <CardDescription className="text-xs">מפתח Homely לסנכרון נכסים מ-homely.co.il</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={status.homely} />
                <StatusBadge status={status.homely} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecretField
              id="homely-key"
              label="Homely API Key"
              value={homelyKey}
              onChange={setHomelyKey}
              placeholder="הדבק את מפתח Homely כאן"
              show={!!show.homely}
              onToggleShow={() => toggleShow('homely')}
            />
            <Separator />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleTestHomely} disabled={status.homely === 'testing'} className="gap-2">
                {status.homely === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                בדיקת חיבור
              </Button>
              <Button size="sm" onClick={handleSaveHomely} disabled={saving === 'homely'} className="gap-2">
                {saving === 'homely' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConnectionSettings;
