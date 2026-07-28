import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import {
  Save, Trash2, Webhook, Eye, EyeOff, Zap, Loader2,
  MessageCircle, Sparkles, Shield, ShieldCheck, Lock,
  CheckCircle, XCircle, Activity, Clock, User, Database,
  KeyRound, Fingerprint, Megaphone, Home, Building, Brain,
  Phone, Send, Inbox, Map, Copy, RefreshCw,
} from 'lucide-react';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { format } from 'date-fns';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { ChevronDown } from 'lucide-react';
import NotificationPreferencesPanel from '@/components/NotificationPreferencesPanel';
import { AgentPersonaPanel } from '@/components/AgentPersonaPanel';
import { PersonaCalibrationPanel } from '@/components/PersonaCalibrationPanel';
import { ProductionPrepPanel } from '@/components/ProductionPrepPanel';
import { WebtivHomelySyncCard } from '@/components/integrations/WebtivHomelySyncCard';
import { AyrshareProfilePurgeCard } from '@/components/admin/AyrshareProfilePurgeCard';
import { AyrshareBulkPurgeCard } from '@/components/admin/AyrshareBulkPurgeCard';
import { VoiceAgentPanel } from '@/components/calendar/VoiceAgentPanel';
import { UsageMeterPanel } from '@/components/UsageMeterPanel';
import { ServiceAreasPanel } from '@/components/settings/ServiceAreasPanel';
import { MetaWhatsAppAuthCard } from '@/components/settings/MetaWhatsAppAuthCard';
import { MetaWabaHealthCard } from '@/components/settings/MetaWabaHealthCard';
import { WhatsAppTwoWayTestCard } from '@/components/settings/WhatsAppTwoWayTestCard';
import { SocialChannelsGrid } from '@/components/social/SocialChannelsGrid';
import { CustomGroupsManager } from '@/components/social/CustomGroupsManager';

interface ApiConfig {
  id: string;
  service_name: string;
  api_key: string;
  webhook_url: string | null;
  is_active: boolean;
  updated_at: string | null;
}

type WaGateway = 'green_api' | 'official_wba';

const maskKey = (key: string) => {
  if (!key || key === 'none') return '-';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
};

/* Legacy decorative panels (SecureConnectionBanner, EncryptionStatusCard,
   AuditLogCard, DbAccessLog) removed — unused visual noise.
   Shared context for ServiceCard / FeatureRow (kept at module scope so these
   helpers don't get a fresh identity per parent render — that would unmount
   their <Input>s and steal focus on every keystroke). */
type ApiSettingsCtxValue = {
  isServiceEnabled: (key: string, fallback?: boolean) => boolean;
  toggleService: { mutate: (vars: { key: string; enabled: boolean }) => void };
  savingKey: string | null;
  testingService: string | null;
};
const ApiSettingsCtx = createContext<ApiSettingsCtxValue | null>(null);
const useApiSettingsCtx = () => {
  const ctx = useContext(ApiSettingsCtx);
  if (!ctx) throw new Error('ApiSettingsCtx missing');
  return ctx;
};

const FeatureRow = ({
  title, learnMore, icon: Icon, iconColor, serviceKey,
}: {
  title: string; description: string; learnMore: string;
  icon: React.ElementType; iconColor: string; serviceKey: string;
}) => {
  const { isServiceEnabled, toggleService } = useApiSettingsCtx();
  const enabled = isServiceEnabled(serviceKey, false);
  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-border/50 bg-card first:rounded-t-lg last:rounded-b-lg -mt-px">
      <Icon className={`h-5 w-5 shrink-0 ${iconColor} ${!enabled ? 'opacity-40' : ''}`} />
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className={`text-sm font-bold truncate ${!enabled ? 'text-muted-foreground' : ''}`}>{title}</span>
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="text-[11px] text-muted-foreground/70 hover:text-primary hover:underline transition-colors">
              למידע נוסף
            </button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${iconColor}`} />
                {title}
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-relaxed">
                {learnMore}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => toggleService.mutate({ key: serviceKey, enabled: v })}
        aria-label={`Toggle ${title}`}
      />
      <span className="w-4 shrink-0" aria-hidden="true" />
    </div>
  );
};

const ServiceCard = ({
  title, icon: Icon, iconColor, config, children, onDelete, onTest, onSave, saveLabel,
  testLabel = 'בדיקת חיבור', badgeLabel, savingId, testingId, value, isConnected, serviceKey,
  hideActions,
}: {
  title: string; icon: React.ElementType; iconColor: string; config?: ApiConfig | undefined;
  children?: React.ReactNode; onDelete?: () => void; onTest?: () => void; onSave?: () => void;
  saveLabel?: string; testLabel?: string; badgeLabel?: string; savingId?: string; testingId?: string;
  value: string; isConnected?: boolean; serviceKey: string; hideActions?: boolean;
}) => {
  const { isServiceEnabled, toggleService, savingKey, testingService } = useApiSettingsCtx();
  const connected = isConnected ?? !!config?.is_active;
  const enabled = isServiceEnabled(serviceKey, connected);
  return (
    <AccordionItem value={value} className="border border-border/50 bg-card overflow-hidden first:rounded-t-lg last:rounded-b-lg data-[state=open]:border-border/80 data-[state=open]:shadow-sm data-[state=open]:relative data-[state=open]:z-10">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20 [&>svg]:hidden">
        <div className="flex items-center gap-3 w-full">
          <Icon className={`h-5 w-5 shrink-0 ${iconColor} ${!enabled ? 'opacity-40' : ''}`} />
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className={`text-sm font-bold truncate ${!enabled ? 'text-muted-foreground' : ''}`}>{title}</span>
          </div>
          <div
            role="presentation"
            onClick={(e) => { e.stopPropagation(); }}
            onPointerDown={(e) => { e.stopPropagation(); }}
            className="flex items-center"
          >
            <Switch
              checked={enabled}
              onCheckedChange={(v) => toggleService.mutate({ key: serviceKey, enabled: v })}
              aria-label={`Toggle ${title}`}
            />
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
        </div>
      </AccordionTrigger>
      {children && (
        <AccordionContent className="px-4 pb-4 pt-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">סטטוס</span>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_6px_hsl(var(--success))]' : 'bg-red-500'}`}
                />
                <span className={`text-xs font-medium ${connected ? 'text-emerald-600' : 'text-red-600'}`}>
                  {connected ? 'מוכן' : 'לא מוגדר'}
                </span>
              </div>
            </div>
            {!connected && (
              <div className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                הגדירו את השירות כדי להפעיל אותו — מלאו את השדות מטה ולחצו "שמירה".
              </div>
            )}
            {children}
            {!hideActions && onSave && (
              <div className="flex gap-2 items-center">
                <Button onClick={onSave} disabled={savingKey === savingId} className="flex-1" size="sm">
                  <Save className="h-4 w-4 ml-2" />
                  {savingKey === savingId ? 'שומר...' : saveLabel}
                </Button>
                {onTest && (
                  <Button variant="outline" size="sm" onClick={onTest} disabled={testingService === testingId} className="gap-2">
                    {testingService === testingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    {testLabel}
                  </Button>
                )}
                {config && onDelete && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
};

/* ─── Collapsible section shell (closed by default) ─── */
const SectionShell = ({
  title, subtitle, defaultOpen = false, children,
}: {
  title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-border/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-muted/30 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-3">{children}</div>}
    </Card>
  );
};

/* ─── Main Settings Page ─── */
const ApiSettings = () => {
  const queryClient = useQueryClient();
  const blockDemoAction = useDemoGuard();
  const { isSuperAdmin } = useUserRole();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [connectionChecking, setConnectionChecking] = useState(true);

  // WhatsApp gateway state
  const [waGateway, setWaGateway] = useState<WaGateway>('green_api');
  const [greenApiInstanceId, setGreenApiInstanceId] = useState('');
  const [greenApiToken, setGreenApiToken] = useState('');
  const [wbaPhoneId, setWbaPhoneId] = useState('');
  const [wbaAccessToken, setWbaAccessToken] = useState('');
  const [greenWebhookSync, setGreenWebhookSync] = useState<null | { ok: boolean; timestamp: string; message: string }>(null);

  // n8n state
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [n8nApiKey, setN8nApiKey] = useState('');

  // Gemini / AI state
  const [geminiApiKey, setGeminiApiKey] = useState('');

  // 019 SMS state
  const [smsUser, setSmsUser] = useState('');
  const [smsPass, setSmsPass] = useState('');
  const [smsSender, setSmsSender] = useState('');

  // Mapbox state
  const [mapboxToken, setMapboxToken] = useState('');

  // Meta Marketing API state
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [metaPageId, setMetaPageId] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');

  // Homely API state
  const [homelyApiKey, setHomelyApiKey] = useState('');
  const [homelyHasKey, setHomelyHasKey] = useState(false);
  const [homelyLoaded, setHomelyLoaded] = useState(false);
  // Open Card (auto-push) credentials
  const [homelyClientCode, setHomelyClientCode] = useState('');
  const [homelyProvider, setHomelyProvider] = useState('Realtyz');
  const [homelyDefaultAgent, setHomelyDefaultAgent] = useState('');
  // Per-broker Homely login (stored encrypted server-side)
  const [homelyAgency, setHomelyAgency] = useState('');
  const [homelyUsername, setHomelyUsername] = useState('');
  const [homelyPassword, setHomelyPassword] = useState('');
  const [homelyHasPassword, setHomelyHasPassword] = useState(false);
  const [homelyConnStatus, setHomelyConnStatus] = useState<string>('not_configured');
  const [homelyLastVerified, setHomelyLastVerified] = useState<string | null>(null);
  const [homelyWebhookToken, setHomelyWebhookToken] = useState<string>('');
  const [homelyFeedUrl, setHomelyFeedUrl] = useState<string>('');
  // Diagnostic snapshot from the last "Test Connection" run.
  const [homelyDiag, setHomelyDiag] = useState<null | {
    ok: boolean;
    request: { url: string; method: string; headers: Record<string, string> };
    response: { status: number | null; statusText: string; body: unknown };
    error?: string;
    timestamp: string;
  }>(null);
  const { user: authUser } = useAuth();

  // Per-service On/Off toggles (service_toggles table)
  const { data: serviceToggles = [] } = useQuery({
    queryKey: ['service-toggles', authUser?.id],
    enabled: !!authUser?.id,
    queryFn: async () => {
      const { data } = await supabaseClient
        .from('service_toggles')
        .select('*')
        .eq('user_id', authUser!.id);
      return data ?? [];
    },
  });

  const toggleService = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      if (!authUser) throw new Error('not-auth');
      const existing = serviceToggles.find((t) => t.service_key === key);
      if (existing) {
        const { error } = await supabaseClient
          .from('service_toggles')
          .update({ enabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient
          .from('service_toggles')
          .insert({ user_id: authUser.id, service_key: key, enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-toggles'] });
    },
    onError: () => toast.error('עדכון השירות נכשל'),
  });

  const isServiceEnabled = (key: string, fallback: boolean = false) => {
    const t = serviceToggles.find((x) => x.service_key === key);
    return t ? t.enabled : fallback; // default OFF unless a fallback is provided
  };


  const edgeFnBase = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/manage-api-configs`;
  const whatsappWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const edgeFnHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  // Secure connection verification on load
  useEffect(() => {
    const verify = async () => {
      setConnectionChecking(true);
      try {
        // Test DB connectivity
        const { error } = await supabase.from('leads').select('id', { count: 'exact', head: true });
        // Test edge function connectivity
        const res = await fetch(edgeFnBase, { headers: edgeFnHeaders });
        setConnectionVerified(!error && res.ok);
      } catch {
        setConnectionVerified(false);
      } finally {
        setConnectionChecking(false);
      }
    };
    verify();
  }, []);

  const { data: configs } = useQuery({
    queryKey: ['api-configs'],
    queryFn: async () => {
      const res = await fetch(edgeFnBase, { headers: edgeFnHeaders });
      if (!res.ok) throw new Error('Failed to load configs');
      return (await res.json()) as ApiConfig[];
    },
  });

  // Load existing configs into form state
  useEffect(() => {
    if (!configs) return;
    const greenApi = configs.find((c) => c.service_name === 'Green API');
    const wba = configs.find((c) => c.service_name === 'WhatsApp Business');
    const n8n = configs.find((c) => c.service_name === 'n8n Webhook');

    if (wba?.is_active) setWaGateway('official_wba');
    else if (greenApi?.is_active) setWaGateway('green_api');

    if (greenApi) {
      const parts = greenApi.api_key.split(':');
      if (parts.length >= 2) {
        setGreenApiInstanceId(parts[0]);
        setGreenApiToken(parts.slice(1).join(':'));
      }
    }
    if (wba) {
      const parts = wba.api_key.split(':');
      if (parts.length >= 2) {
        setWbaPhoneId(parts[0]);
        setWbaAccessToken(parts.slice(1).join(':'));
      }
    }

    if (n8n) {
      setN8nWebhookUrl(n8n.webhook_url ?? '');
      if (n8n.api_key && n8n.api_key !== 'none') setN8nApiKey(n8n.api_key);
    }

    const gemini = configs.find((c) => c.service_name === 'Gemini AI');
    if (gemini) setGeminiApiKey(gemini.api_key);

    const sms = configs.find((c) => c.service_name === '019 SMS');
    if (sms) {
      const parts = sms.api_key.split(':');
      if (parts.length >= 2) {
        setSmsUser(parts[0]);
        setSmsPass(parts[1] || '');
        setSmsSender(parts.slice(2).join(':') || '');
      }
    }

    const mapbox = configs.find((c) => c.service_name === 'Mapbox');
    if (mapbox) setMapboxToken(mapbox.api_key);

    const meta = configs.find((c) => c.service_name === 'Meta Marketing API');
    if (meta?.api_key) {
      try {
        const parsed = JSON.parse(meta.api_key);
        setMetaAccessToken(parsed.access_token ?? '');
        setMetaAdAccountId(parsed.ad_account_id ?? '');
        setMetaPageId(parsed.page_id ?? '');
        setMetaPixelId(parsed.pixel_id ?? '');
      } catch {
        setMetaAccessToken(meta.api_key);
      }
    }
  }, [configs]);

  const upsertConfig = useMutation({
    mutationFn: async ({ serviceName, apiKey, webhookUrl }: { serviceName: string; apiKey: string; webhookUrl?: string }) => {
      if (blockDemoAction('save-api-key')) throw new Error('demo-blocked');
      const res = await fetch(edgeFnBase, {
        method: 'POST',
        headers: edgeFnHeaders,
        body: JSON.stringify({ service_name: serviceName, api_key: apiKey, webhook_url: webhookUrl || null, is_active: true }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Save failed'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api-configs'] }); toast.success('ההגדרה נשמרה בהצלחה'); setSavingKey(null); },
    onError: (error: Error) => { if (error.message !== 'demo-blocked') toast.error('שמירת ההגדרה נכשלה'); setSavingKey(null); },
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      if (blockDemoAction('delete-api-key')) throw new Error('demo-blocked');
      const res = await fetch(edgeFnBase, { method: 'DELETE', headers: edgeFnHeaders, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api-configs'] }); toast.success('ההגדרה נמחקה'); },
    onError: (error: Error) => { if (error.message !== 'demo-blocked') toast.error('מחיקת ההגדרה נכשלה'); },
  });

  // ─── Save handlers ───
  const handleSaveWhatsApp = async () => {
    if (waGateway === 'green_api') {
      if (!greenApiInstanceId || !greenApiToken) { toast.error('יש למלא Instance ID ו-API Token'); return; }
      setSavingKey('whatsapp');
      const wba = configs?.find((c) => c.service_name === 'WhatsApp Business');
      if (wba) await fetch(edgeFnBase, { method: 'POST', headers: edgeFnHeaders, body: JSON.stringify({ service_name: 'WhatsApp Business', api_key: wba.api_key, is_active: false }) });
      upsertConfig.mutate({ serviceName: 'Green API', apiKey: `${greenApiInstanceId}:${greenApiToken}` });
    } else {
      if (!wbaPhoneId || !wbaAccessToken) { toast.error('יש למלא Phone Number ID ו-Access Token'); return; }
      setSavingKey('whatsapp');
      const green = configs?.find((c) => c.service_name === 'Green API');
      if (green) await fetch(edgeFnBase, { method: 'POST', headers: edgeFnHeaders, body: JSON.stringify({ service_name: 'Green API', api_key: green.api_key, is_active: false }) });
      upsertConfig.mutate({ serviceName: 'WhatsApp Business', apiKey: `${wbaPhoneId}:${wbaAccessToken}` });
    }
  };

  const handleSaveN8n = () => {
    if (!n8nWebhookUrl) { toast.error('יש להזין כתובת webhook'); return; }
    setSavingKey('n8n');
    upsertConfig.mutate({ serviceName: 'n8n Webhook', apiKey: n8nApiKey || 'none', webhookUrl: n8nWebhookUrl });
  };

  const handleSaveGemini = () => {
    if (!geminiApiKey) { toast.error('יש להזין מפתח API'); return; }
    setSavingKey('gemini');
    upsertConfig.mutate({ serviceName: 'Gemini AI', apiKey: geminiApiKey });
  };

  const handleSaveSms = () => {
    if (!smsUser || !smsPass) { toast.error('יש למלא שם משתמש וסיסמה'); return; }
    if (!smsSender) { toast.error('יש להזין שולח (Sender ID) מאושר על ידי 019'); return; }
    setSavingKey('sms');
    upsertConfig.mutate({ serviceName: '019 SMS', apiKey: `${smsUser}:${smsPass}:${smsSender}` });
  };

  const handleSaveMapbox = () => {
    if (!mapboxToken) { toast.error('יש להזין Mapbox Access Token'); return; }
    setSavingKey('mapbox');
    upsertConfig.mutate({ serviceName: 'Mapbox', apiKey: mapboxToken });
  };

  const handleSaveMeta = () => {
    if (!metaAccessToken && !metaAdAccountId && !metaPageId) { toast.error('יש להזין לפחות אחד מפרטי Meta'); return; }
    setSavingKey('meta');
    upsertConfig.mutate({
      serviceName: 'Meta Marketing API',
      apiKey: JSON.stringify({ access_token: metaAccessToken, ad_account_id: metaAdAccountId, page_id: metaPageId, pixel_id: metaPixelId }),
    });
  };

  // ─── Homely API ───
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const { data } = await supabaseClient
        .from('user_api_keys')
        .select('homely_api_key, homely_client_code, homely_provider, homely_default_agent, homely_auto_push')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (data?.homely_api_key) {
        setHomelyApiKey(data.homely_api_key);
        setHomelyHasKey(true);
      }
      if (data) {
        setHomelyClientCode((data as any).homely_client_code || '');
        setHomelyProvider((data as any).homely_provider || 'Realtyz');
        setHomelyDefaultAgent((data as any).homely_default_agent || '');
      }
      setHomelyLoaded(true);

      // Load Homely broker credentials (login + webhook)
      const { data: cred } = await supabaseClient
        .from('homely_broker_credentials' as any)
        .select('homely_username, homely_agency, connection_status, last_verified_at, webhook_token, homely_password_encrypted, homely_feed_url')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (cred) {
        setHomelyUsername((cred as any).homely_username || '');
        setHomelyAgency((cred as any).homely_agency || '');
        setHomelyConnStatus((cred as any).connection_status || 'not_configured');
        setHomelyLastVerified((cred as any).last_verified_at || null);
        setHomelyWebhookToken((cred as any).webhook_token || '');
        setHomelyHasPassword(Boolean((cred as any).homely_password_encrypted));
        setHomelyFeedUrl((cred as any).homely_feed_url || '');
      }
    })();
  }, [authUser]);

  const handleSaveHomelyLogin = async () => {
    if (!authUser) return;
    if (!homelyAgency.trim()) { toast.error('יש להזין קוד משרד Homely'); return; }
    if (!homelyUsername.trim()) { toast.error('יש להזין שם משתמש Homely'); return; }
    setSavingKey('homely-login');
    try {
      // Save agency + username (and webhook token if missing) via plain upsert
      const { error: upErr } = await supabaseClient
        .from('homely_broker_credentials' as any)
        .upsert({
          user_id: authUser.id,
          homely_agency: homelyAgency.trim(),
          homely_username: homelyUsername.trim(),
          homely_feed_url: homelyFeedUrl.trim() || null,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });
      if (upErr) throw upErr;

      // Save password (only if user typed a new one) via SECURITY DEFINER RPC
      if (homelyPassword.trim()) {
        const { error: pwErr } = await supabaseClient.rpc('set_homely_password' as any, {
          _user_id: authUser.id,
          _password: homelyPassword,
        });
        if (pwErr) throw pwErr;
        setHomelyHasPassword(true);
        setHomelyPassword('');
      }

      // Reload to capture freshly-issued webhook_token
      const { data: cred } = await supabaseClient
        .from('homely_broker_credentials' as any)
        .select('webhook_token, connection_status, last_verified_at')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (cred) {
        setHomelyWebhookToken((cred as any).webhook_token || '');
        setHomelyConnStatus((cred as any).connection_status || 'not_configured');
        setHomelyLastVerified((cred as any).last_verified_at || null);
      }
      toast.success('✅ פרטי כניסה ל‑Homely נשמרו');
    } catch (e: any) {
      toast.error('שמירה נכשלה: ' + e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const handleVerifyHomelyLogin = async () => {
    if (!authUser) return;
    setTestingService('homely-login');
    try {
      const { data, error } = await supabaseClient.functions.invoke('homely-verify-login', {
        body: { user_id: authUser.id },
      });
      if (error) throw error;
      const ok = (data as any)?.ok;
      const status = (data as any)?.status || 'unknown';
      setHomelyConnStatus(status);
      setHomelyLastVerified(new Date().toISOString());
      if (ok) toast.success(status === 'manually_verified'
        ? '✅ פרטי הכניסה נשמרו (אימות אוטומטי יופעל לאחר חיבור Homely)'
        : '✅ חיבור ל‑Homely תקין');
      else toast.error('בדיקה נכשלה');
    } catch (e: any) {
      toast.error('בדיקה נכשלה: ' + e.message);
    } finally {
      setTestingService(null);
    }
  };

  const handleSaveOpenCard = async () => {
    if (!authUser) return;
    if (!homelyClientCode.trim()) { toast.error('יש להזין קוד לקוח Homely'); return; }
    setSavingKey('homely-opencard');
    const { error } = await supabaseClient
      .from('user_api_keys')
      .upsert(
        {
          user_id: authUser.id,
          homely_client_code: homelyClientCode.trim(),
          homely_provider: homelyProvider.trim() || 'Realtyz',
          homely_default_agent: homelyDefaultAgent.trim() || null,
          homely_auto_push: false,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'user_id' },
      );
    setSavingKey(null);
    if (error) { toast.error('שמירה נכשלה: ' + error.message); return; }
    toast.success('✅ פרטי Homely נשמרו');
  };

  const handleSaveHomely = async () => {
    if (!authUser) return;
    if (!homelyApiKey.trim()) { toast.error('יש להזין מפתח Homely API'); return; }
    if (blockDemoAction('save-homely-key')) return;
    setSavingKey('homely');
    const { error } = await supabaseClient
      .from('user_api_keys')
      .upsert(
        { user_id: authUser.id, homely_api_key: homelyApiKey.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    setSavingKey(null);
    if (error) { toast.error('שמירה נכשלה: ' + error.message); return; }
    setHomelyHasKey(true);
    toast.success('✅ מפתח Homely API נשמר בהצלחה');
  };

  const handleTestHomely = async () => {
    if (!homelyHasKey && !homelyApiKey.trim()) {
      toast.error('יש לשמור מפתח לפני בדיקה');
      return;
    }
    setTestingService('homely');
    setHomelyDiag(null);

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const proxyUrl = `https://${projectId}.supabase.co/functions/v1/call-homely-api`;
    const upstreamPath = '/health';
    const upstreamUrl = `https://api.homely.com${upstreamPath}`;
    const requestSnapshot = {
      url: upstreamUrl,
      method: 'GET' as const,
      headers: {
        Authorization: 'Bearer ••••••••',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    console.log('[homely-test] proxy', proxyUrl);
    console.log('[homely-test] upstream', requestSnapshot);

    try {
      const { data, error } = await supabaseClient.functions.invoke('call-homely-api', {
        body: { path: upstreamPath, method: 'GET' },
      });

      const ok = !error && !(data as any)?.error;
      setHomelyDiag({
        ok,
        request: requestSnapshot,
        response: {
          status: (data as any)?.status ?? null,
          statusText: ok ? 'OK' : ((error?.message as string) || (data as any)?.error || 'Failed'),
          body: data ?? null,
        },
        error: error?.message ?? (data as any)?.error,
        timestamp: new Date().toISOString(),
      });

      if (error) toast.error(`❌ חיבור Homely נכשל: ${error.message}`);
      else if ((data as any)?.error) toast.error(`❌ חיבור Homely נכשל: ${(data as any).error}`);
      else toast.success('✅ חיבור Homely API תקין!');
    } catch (err) {
      const message = (err as Error).message;
      setHomelyDiag({
        ok: false,
        request: requestSnapshot,
        response: { status: null, statusText: 'Network error', body: null },
        error: message,
        timestamp: new Date().toISOString(),
      });
      toast.error(`❌ לא ניתן להתחבר ל-Homely: ${message}`);
    } finally {
      setTestingService(null);
    }
  };

  // ─── Test handlers ───
  const handleTestWebhook = async () => {
    const url = n8nWebhookUrl || existingN8n?.webhook_url;
    if (!url) { toast.error('יש לשמור כתובת webhook לפני בדיקה'); return; }
    setTestingService('n8n');
    try {
      const token = n8nApiKey || existingN8n?.api_key;
      const proxyUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/test-webhook`;
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ webhook_url: url, auth_token: token && token !== 'none' ? token : undefined, payload: { type: 'ping', source: 'Realtyz AI', timestamp: new Date().toISOString() } }),
      });
      const data = await res.json();
      if (data.success) toast.success('✅ חיבור n8n תקין - ה-Webhook פעיל!');
      else toast.error(`❌ שגיאת חיבור - קוד ${data.status || res.status}`);
    } catch { toast.error('❌ לא ניתן להתחבר ל-Webhook'); }
    finally { setTestingService(null); }
  };

  const handleTestGemini = async () => {
    const key = geminiApiKey || existingGemini?.api_key;
    if (!key) { toast.error('יש להזין מפתח API לפני בדיקה'); return; }
    setTestingService('gemini');
    try {
      const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ topic: 'בדיקת חיבור', platform: 'twitter' }),
      });
      if (res.ok) toast.success('✅ חיבור Gemini AI תקין!');
      else toast.error(`❌ שגיאת חיבור Gemini - קוד ${res.status}`);
    } catch { toast.error('❌ לא ניתן להתחבר ל-Gemini AI'); }
    finally { setTestingService(null); }
  };

  const handleTestWhatsApp = async () => {
    setTestingService('whatsapp');
    try {
      if (waGateway === 'green_api') {
        const instanceId = greenApiInstanceId || existingGreen?.api_key.split(':')[0];
        const token = greenApiToken || existingGreen?.api_key.split(':').slice(1).join(':');
        if (!instanceId || !token) { toast.error('יש למלא Instance ID ו-API Token'); setTestingService(null); return; }
        const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/getStateInstance/${token}`);
        const data = await res.json();
        if (res.ok && data?.stateInstance === 'authorized') toast.success('✅ חיבור Green API תקין!');
        else if (res.ok) toast.warning(`⚠️ סטטוס: ${data?.stateInstance || 'לא ידוע'}`);
        else toast.error(`❌ שגיאת חיבור - קוד ${res.status}`);
      } else {
        const phoneId = wbaPhoneId || existingWba?.api_key.split(':')[0];
        const token = wbaAccessToken || existingWba?.api_key.split(':').slice(1).join(':');
        if (!phoneId || !token) { toast.error('יש למלא Phone Number ID ו-Access Token'); setTestingService(null); return; }
        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) toast.success('✅ חיבור WhatsApp Business API תקין!');
        else toast.error(`❌ שגיאת חיבור WBA - קוד ${res.status}`);
      }
    } catch { toast.error('❌ לא ניתן להתחבר ל-WhatsApp'); }
    finally { setTestingService(null); }
  };

  const handleSyncGreenApiWebhook = async () => {
    setTestingService('green-webhook-sync');
    setGreenWebhookSync(null);
    try {
      const { data, error } = await supabaseClient.functions.invoke('greenapi-webhook-sync', { body: {} });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || 'sync_failed');
      setGreenWebhookSync({
        ok: true,
        timestamp: new Date().toISOString(),
        message: 'GreenAPI webhook synced to the live endpoint',
      });
      queryClient.invalidateQueries({ queryKey: ['api-configs'] });
      toast.success('✅ GreenAPI Webhook סונכרן לכתובת החיה');
    } catch (e: any) {
      const message = e?.message || 'לא ניתן לסנכרן את GreenAPI';
      setGreenWebhookSync({ ok: false, timestamp: new Date().toISOString(), message });
      toast.error(`❌ סנכרון GreenAPI נכשל: ${message}`);
    } finally {
      setTestingService(null);
    }
  };

  const handleTestSms = async () => {
    setTestingService('sms');
    try {
      const user = smsUser || existingSms?.api_key.split(':')[0];
      const pass = smsPass || existingSms?.api_key.split(':').slice(1).join(':');
      if (!user || !pass) { toast.error('יש למלא שם משתמש וסיסמה'); setTestingService(null); return; }
      const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/test-sms-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ user, password: pass }),
      });
      const data = await res.json();
      if (data.success) toast.success(`✅ חיבור 019 SMS תקין - יתרה: ${data.credit}`);
      else toast.error(`❌ שגיאת חיבור 019 SMS - ${data.error || 'לא ידוע'}`);
    } catch { toast.error('❌ לא ניתן להתחבר ל-019 SMS'); }
    finally { setTestingService(null); }
  };

  const existingGreen = configs?.find((c) => c.service_name === 'Green API');
  const existingWba = configs?.find((c) => c.service_name === 'WhatsApp Business');
  const existingN8n = configs?.find((c) => c.service_name === 'n8n Webhook');
  const existingGemini = configs?.find((c) => c.service_name === 'Gemini AI');
  const existingSms = configs?.find((c) => c.service_name === '019 SMS');
  const existingMapbox = configs?.find((c) => c.service_name === 'Mapbox');
  const existingMeta = configs?.find((c) => c.service_name === 'Meta Marketing API');
  const activeWaConfig = waGateway === 'green_api' ? existingGreen : existingWba;

  const KeyDisplay = ({ label, value, id }: { label: string; value: string; id: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono" dir="ltr">{showKeys[id] ? value : maskKey(value)}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowKeys((p) => ({ ...p, [id]: !p[id] }))}>
          {showKeys[id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );

  return (
    <ApiSettingsCtx.Provider value={{ isServiceEnabled, toggleService, savingKey, testingService }}>
    <div className="space-y-3" dir="rtl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-primary">הגדרות מערכת</h1>
        <p className="text-muted-foreground text-xs mt-0.5">
          הפעל/י שירותים, נהל/י מפתחות והגדרות פלטפורמה. כל הכרטיסים סגורים כברירת מחדל — לחצ/י על כרטיס לפתיחה.
        </p>
      </div>

      <UsageMeterPanel />

      <SectionShell title="פרטיות ו-GDPR" subtitle="מסכת PII, ביקורת ומחיקת מתעניין לצמיתות">
        <p className="text-xs text-muted-foreground">
          נתונים אישיים (ת.ז., אימיילים, טלפונים) מוסתרים אוטומטית לפני שליחה ל-AI וביומני הצוות.
          כל ייצוא/מחיקה של מתעניין נרשם ביומן ביקורת בלתי-ניתן-לעריכה.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default" size="sm">
            <a href="/privacy">
              <ShieldCheck className="h-4 w-4 ms-1.5" aria-hidden="true" />
              מרכז פרטיות ומחיקה
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/privacy">ייצוא נתוני מתעניין</a>
          </Button>
        </div>
      </SectionShell>

      <SectionShell title="תכונות פלטפורמה" subtitle="מתגי On/Off לשירותי AI פנימיים">
        <div className="rounded-lg overflow-hidden">
          <FeatureRow
            title="AI Touchpoint (שיחות AI)"
            description="בוט קולי שמתקשר למתעניינים חמים"
            learnMore="AI Touchpoint מפעיל בוט קולי שמתקשר באופן יזום למתעניינים חמים, מנהל שיחה קצרה, מסווג עניין ומעדכן את ה-CRM."
            icon={Phone}
            iconColor="text-blue-500"
            serviceKey="ai_voice"
          />
          <FeatureRow
            title="מחולל תוכן AI"
            description="יצירת פוסטים, סלוגנים ותגובות"
            learnMore="מחולל התוכן יוצר טיוטות לפוסטים, סלוגנים ותגובות בהתבסס על הטון והמיתוג שהגדרת."
            icon={Sparkles}
            iconColor="text-amber-500"
            serviceKey="ai_content"
          />
          <FeatureRow
            title="תיבת Omnichannel"
            description="איחוד כל הערוצים לתיבה אחת"
            learnMore="תיבת ה-Omnichannel מאחדת WhatsApp, SMS, Messenger, Instagram ועוד לתיבה אחת."
            icon={Inbox}
            iconColor="text-teal-500"
            serviceKey="omnichannel_inbox"
          />
        </div>
      </SectionShell>

      <SectionShell title="Virtual Twin · התאומה הדיגיטלית" subtitle="טון, ביו ופילוסופיית מכירה — ה-AI ינסח כמוך">
        <AgentPersonaPanel />
      </SectionShell>

      <SectionShell title="הכנה לפרודקשן" subtitle="דומיין, סביבת דמו, ייצוא נתונים ומחיקת PII">
        <ProductionPrepPanel />
      </SectionShell>

      <SectionShell title="רשתות חברתיות" subtitle="Ayrshare, קטלוג ערוצים חי וקבוצות מותאמות">
        <SocialChannelsGrid />
        <CustomGroupsManager />
      </SectionShell>

      <SectionShell title="AI Fine-Tuning" subtitle="כיול סגנון מהשיחות שלך">
        <PersonaCalibrationPanel />
      </SectionShell>

      <SectionShell title="אזור התמחות" subtitle="ערים ושכונות שאת/ה מתמחה בהן">
        <ServiceAreasPanel />
      </SectionShell>

      <SectionShell title="AI Voice Agent" subtitle="עוזר טלפוני שעונה כשאת/ה לא זמין/ה">
        <VoiceAgentPanel />
      </SectionShell>

      <SectionShell title="התראות חכמות" subtitle="Smart Notifications ב-WhatsApp על אירועים קריטיים">
        <NotificationPreferencesPanel />
      </SectionShell>

      <SectionShell title="אינטגרציות חיצוניות · מפתחות API" subtitle="Homely, Gemini, Meta, WhatsApp, n8n, SMS, Mapbox">

        <Accordion type="multiple" className="-space-y-px">

      {/* Homely API */}
      <ServiceCard
        title="Homely API"
        icon={Building}
        iconColor="text-orange-500"
        badgeLabel="Per-Agent Key"
        value="homely"
        serviceKey="homely"
        isConnected={homelyHasKey}
        onSave={handleSaveHomely}
        onTest={handleTestHomely}
        saveLabel={homelyHasKey ? 'עדכן מפתח' : 'שמור מפתח'}
        savingId="homely"
        testingId="homely"
      >
        <p className="text-xs text-muted-foreground">
          מפתח אישי לחיבור לשירותי Homely. נשמר מוצפן עם RLS — רק את/ה יכול/ה לגשת אליו.
        </p>
        {homelyHasKey && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
            <KeyDisplay label="Homely API Key" value={homelyApiKey} id="homely_current" />
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs">{homelyHasKey ? 'עדכון מפתח Homely' : 'מפתח Homely חדש'}</Label>
          <div className="relative">
            <Input
              placeholder="הדבק את מפתח Homely API כאן..."
              type={showKeys.homely ? 'text' : 'password'}
              value={homelyApiKey}
              onChange={(e) => setHomelyApiKey(e.target.value)}
              dir="ltr"
              className="pl-9"
              autoComplete="off"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowKeys((p) => ({ ...p, homely: !p.homely }))}
            >
              {showKeys.homely ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* ── Homely credentials (READ-ONLY: we only pull data from Homely) ── */}
        <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">פרטי גישה ל-Homely (קריאה בלבד)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Realtyz מושכת נתונים מ‑Homely / WebTiv בלבד ואינה כותבת אליהם מידע.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">קוד לקוח Homely *</Label>
              <Input
                dir="ltr"
                placeholder="XXXXXX-XXXXX-XXX-XXXXXX"
                value={homelyClientCode}
                onChange={(e) => setHomelyClientCode(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">שם ספק (Provider)</Label>
              <Input
                placeholder="Realtyz"
                value={homelyProvider}
                onChange={(e) => setHomelyProvider(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">סוכן ברירת מחדל</Label>
              <Input
                placeholder="אילן (אופציונלי)"
                value={homelyDefaultAgent}
                onChange={(e) => setHomelyDefaultAgent(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveOpenCard} disabled={savingKey === 'homely-opencard'}>
              {savingKey === 'homely-opencard' ? 'שומר…' : 'שמור פרטי Open Card'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            הקטגוריה (קונה / שוכר / מוכר וכו׳) נגזרת אוטומטית מסוג העסקה והעדפות המתעניין.
          </p>
        </div>

        {/* ── Homely account login (per-broker) ── */}
        <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">חשבון Homely שלך</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                פרטי הכניסה שלך לאתר Homely. הסיסמה נשמרת מוצפנת ולא נחשפת חזרה לדפדפן.
              </p>
            </div>
            <Badge variant="outline" className={
              homelyConnStatus === 'ok' || homelyConnStatus === 'manually_verified'
                ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                : homelyConnStatus === 'failed'
                ? 'bg-red-500/15 text-red-700 border-red-500/30'
                : homelyConnStatus === 'disabled_by_admin'
                ? 'bg-amber-500/15 text-amber-800 border-amber-500/30'
                : 'bg-muted text-muted-foreground'
            }>
              {homelyConnStatus === 'ok' && 'תקין'}
              {homelyConnStatus === 'manually_verified' && 'מאומת'}
              {homelyConnStatus === 'failed' && 'נכשל'}
              {homelyConnStatus === 'disabled_by_admin' && 'הושבת ע״י אדמין'}
              {homelyConnStatus === 'not_configured' && 'לא מוגדר'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">קוד משרד (client)</Label>
              <Input
                dir="ltr"
                value={homelyAgency}
                onChange={(e) => setHomelyAgency(e.target.value)}
                placeholder="לדוגמה: 9095"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">שם משתמש Homely</Label>
              <Input
                dir="ltr"
                value={homelyUsername}
                onChange={(e) => setHomelyUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">סיסמה {homelyHasPassword && <span className="text-muted-foreground">(שמורה — מלאי רק כדי להחליף)</span>}</Label>
              <Input
                type="password"
                dir="ltr"
                value={homelyPassword}
                onChange={(e) => setHomelyPassword(e.target.value)}
                placeholder={homelyHasPassword ? '•••••••• (שמורה)' : 'הזן סיסמה'}
                autoComplete="new-password"
              />
          </div>

          <div className="space-y-1 pt-2 border-t border-border/30">
            <Label className="text-xs">כתובת פיד XML של Homely (לטעינת נכסים)</Label>
            <Input
              dir="ltr"
              value={homelyFeedUrl}
              onChange={(e) => setHomelyFeedUrl(e.target.value)}
              placeholder="https://www.homely.co.il/feed/xml/..."
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              כדי להציג את הנכסים שלך כאן, יש להזין את כתובת פיד ה‑XML שלכם מהומלי
              (נמצא בהגדרות הומלי ← הפצה לאתרים / פיד XML). ה‑API של Homely חושף רק
              הזרמת ליד יוצאת (<span dir="ltr">POST /api/WebtivLid/WebtivLidPost</span>) —
              אין endpoint ציבורי למשיכת נכסים, לכן אנו קוראים את הפיד הרשמי שלכם
              שמופץ לפורטלים חיצוניים.
            </p>
          </div>

          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              {homelyLastVerified
                ? `אומת לאחרונה: ${new Date(homelyLastVerified).toLocaleString('he-IL')}`
                : 'טרם אומת'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleVerifyHomelyLogin}
                disabled={testingService === 'homely-login' || !homelyAgency.trim() || !homelyUsername.trim() || (!homelyHasPassword && !homelyPassword)}>
                {testingService === 'homely-login' ? 'בודק…' : 'בדוק כניסה'}
              </Button>
              <Button size="sm" onClick={handleSaveHomelyLogin} disabled={savingKey === 'homely-login'}>
                {savingKey === 'homely-login' ? 'שומר…' : 'שמור פרטי כניסה'}
              </Button>
            </div>
          </div>

          {homelyWebhookToken && (
            <div className="space-y-1 pt-2 border-t border-border/30">
              <Label className="text-xs">כתובת Webhook נכנס מ‑Homely</Label>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  readOnly
                  value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/homely-webhook?token=${homelyWebhookToken}`}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="font-mono text-[11px]"
                />
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/homely-webhook?token=${homelyWebhookToken}`
                  );
                  toast.success('הועתק');
                }}>
                  העתק
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                הדבק כתובת זו בהגדרות ה‑Webhook בחשבון ה‑Homely שלך כדי שלידים ועדכוני סטטוס יזרמו אוטומטית ל‑Realtyz.
              </p>
            </div>
          )}
        </div>

        {/* ── Webtiv ⇄ Homely background sync ── */}
        <WebtivHomelySyncCard />



        {homelyDiag && (
          <div className={`mt-3 rounded-lg border p-3 text-xs space-y-2 ${
            homelyDiag.ok
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {homelyDiag.ok ? '✅ Connection OK' : '❌ Connection failed'}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {new Date(homelyDiag.timestamp).toLocaleTimeString('he-IL')}
              </span>
            </div>
            <div dir="ltr" className="space-y-1.5 font-mono">
              <div>
                <span className="text-muted-foreground">שיטה:</span> {homelyDiag.request.method}
              </div>
              <div className="break-all">
                <span className="text-muted-foreground">URL:</span> {homelyDiag.request.url}
              </div>
              <div>
                <span className="text-muted-foreground">Headers:</span>
                <pre className="mt-0.5 p-2 rounded bg-background/60 overflow-auto text-[10px]">
{JSON.stringify(homelyDiag.request.headers, null, 2)}
                </pre>
              </div>
              <div>
                <span className="text-muted-foreground">Response:</span>{' '}
                <span className={homelyDiag.ok ? 'text-emerald-600' : 'text-red-600'}>
                  {homelyDiag.response.status ?? '—'} {homelyDiag.response.statusText}
                </span>
                <pre className="mt-0.5 p-2 rounded bg-background/60 overflow-auto text-[10px] max-h-40">
{JSON.stringify(homelyDiag.response.body, null, 2)}
                </pre>
              </div>
              {homelyDiag.error && (
                <div className="text-red-600">
                  <span className="text-muted-foreground">Error:</span> {homelyDiag.error}
                </div>
              )}
            </div>
          </div>
        )}
      </ServiceCard>

      <ServiceCard
        title="Gemini AI"
        icon={Brain}
        iconColor="text-indigo-500"
        config={existingGemini}
        onDelete={existingGemini ? () => deleteConfig.mutate(existingGemini.id) : undefined}
        onTest={handleTestGemini}
        onSave={handleSaveGemini}
        saveLabel={existingGemini ? 'עדכן מפתח' : 'שמור מפתח'}
        savingId="gemini"
        testingId="gemini"
        value="gemini"
        serviceKey="gemini"
      >
        {existingGemini && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
            <KeyDisplay label="API Key" value={existingGemini.api_key} id="gemini_current" />
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs">{existingGemini ? 'עדכון מפתח API' : 'מפתח API חדש'}</Label>
          <div className="relative">
            <Input placeholder="AIzaSy..." type={showKeys.gemini ? 'text' : 'password'} value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} dir="ltr" className="pl-9" />
            <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKeys((p) => ({ ...p, gemini: !p.gemini }))}>
              {showKeys.gemini ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </ServiceCard>

      <ServiceCard
        title="Meta Marketing API"
        icon={Megaphone}
        iconColor="text-blue-600"
        config={existingMeta}
        badgeLabel="Facebook / Instagram Ads"
        onDelete={existingMeta ? () => deleteConfig.mutate(existingMeta.id) : undefined}
        onTest={() => toast.info('בדיקת Meta תופעל לאחר הזנת הפרטים הסופיים')}
        onSave={handleSaveMeta}
        saveLabel={existingMeta ? 'עדכן פרטי Meta' : 'שמור פרטי Meta'}
        testLabel="בדיקה בהמשך"
        savingId="meta"
        testingId="meta"
        value="meta"
        serviceKey="meta_ads"
      >
        {existingMeta && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
            <KeyDisplay label="Meta Config" value={existingMeta.api_key} id="meta_current" />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Access Token</Label>
            <Input placeholder="EAAB..." type={showKeys.meta ? 'text' : 'password'} value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Ad Account ID</Label>
            <Input placeholder="act_123456789" value={metaAdAccountId} onChange={(e) => setMetaAdAccountId(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Page ID</Label>
            <Input placeholder="123456789" value={metaPageId} onChange={(e) => setMetaPageId(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Pixel ID (אופציונלי)</Label>
            <Input placeholder="123456789" value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} dir="ltr" />
          </div>
        </div>
      </ServiceCard>

      <div className="mb-4">
        <MetaWhatsAppAuthCard />
      </div>

      <div className="mb-4">
        <MetaWabaHealthCard />
      </div>

      <div className="mb-4">
        <WhatsAppTwoWayTestCard />
      </div>



      <ServiceCard
        title="שער WhatsApp"
        icon={MessageCircle}
        iconColor="text-green-500"
        config={activeWaConfig}
        badgeLabel={waGateway === 'green_api' ? 'WBA' : 'WBA רשמי'}
        onDelete={activeWaConfig ? () => deleteConfig.mutate(activeWaConfig.id) : undefined}
        onTest={handleTestWhatsApp}
        onSave={handleSaveWhatsApp}
        saveLabel={activeWaConfig ? 'עדכן הגדרה' : 'שמור הגדרה'}
        savingId="whatsapp"
        testingId="whatsapp"
        value="whatsapp"
        serviceKey="whatsapp"
      >
        {activeWaConfig && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30 space-y-1">
            <p className="text-xs font-medium mb-2">מפתחות שמורים:</p>
            {waGateway === 'green_api' && existingGreen ? (
              <>
                <KeyDisplay label="Instance ID" value={existingGreen.api_key.split(':')[0] || ''} id="green_inst" />
                <KeyDisplay label="API Token" value={existingGreen.api_key.split(':').slice(1).join(':') || ''} id="green_tok" />
              </>
            ) : existingWba ? (
              <>
                <KeyDisplay label="Phone Number ID" value={existingWba.api_key.split(':')[0] || ''} id="wba_phone" />
                <KeyDisplay label="Access Token" value={existingWba.api_key.split(':').slice(1).join(':') || ''} id="wba_tok" />
              </>
            ) : null}
          </div>
        )}
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">Live WhatsApp Webhook POST URL</p>
              <p className="text-[11px] text-muted-foreground">הכתובת הזו פתוחה לקבלת POST מ-GreenAPI ללא Bearer token.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => {
                navigator.clipboard?.writeText(whatsappWebhookUrl);
                toast.success('כתובת ה-Webhook הועתקה');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              העתק
            </Button>
          </div>
          <div className="rounded-md border border-border/40 bg-background/70 px-3 py-2 text-[11px] font-mono break-all text-left" dir="ltr">
            {whatsappWebhookUrl}
          </div>
          {existingGreen?.webhook_url && (
            <div className="rounded-md border border-border/30 bg-background/50 px-3 py-2 text-[11px]">
              <span className="text-muted-foreground">Saved mapping: </span>
              <span className="font-mono break-all" dir="ltr">{existingGreen.webhook_url}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Sync מפעיל ב-GreenAPI את incomingWebhook, outgoingWebhook, outgoingMessageWebhook ו-outgoingAPIMessageWebhook.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSyncGreenApiWebhook}
              disabled={testingService === 'green-webhook-sync' || waGateway !== 'green_api'}
              className="gap-2 shrink-0"
            >
              {testingService === 'green-webhook-sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync GreenAPI Webhook
            </Button>
          </div>
          {greenWebhookSync && (
            <div className={`rounded-md border px-3 py-2 text-[11px] ${greenWebhookSync.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-destructive/30 bg-destructive/10'}`}>
              {greenWebhookSync.ok ? '✅' : '❌'} {greenWebhookSync.message}
            </div>
          )}
        </div>
        <RadioGroup value={waGateway} onValueChange={(v) => setWaGateway(v as WaGateway)} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="green_api" id="green_api" />
            <Label htmlFor="green_api" className="text-sm cursor-pointer">WBA</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="official_wba" id="official_wba" />
            <Label htmlFor="official_wba" className="text-sm cursor-pointer">WBA רשמי</Label>
          </div>
        </RadioGroup>
        <Separator />
        {waGateway === 'green_api' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Instance ID</Label>
              <Input placeholder="1103XXXXXX" value={greenApiInstanceId} onChange={(e) => setGreenApiInstanceId(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">API Token</Label>
              <div className="relative">
                <Input placeholder="xxxxxxxx..." type={showKeys.green ? 'text' : 'password'} value={greenApiToken} onChange={(e) => setGreenApiToken(e.target.value)} dir="ltr" className="pl-9" />
                <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKeys((p) => ({ ...p, green: !p.green }))}>
                  {showKeys.green ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Phone Number ID</Label>
              <Input placeholder="1234567890XXXXX" value={wbaPhoneId} onChange={(e) => setWbaPhoneId(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Access Token</Label>
              <div className="relative">
                <Input placeholder="EAAxxxxxxx..." type={showKeys.wba ? 'text' : 'password'} value={wbaAccessToken} onChange={(e) => setWbaAccessToken(e.target.value)} dir="ltr" className="pl-9" />
                <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKeys((p) => ({ ...p, wba: !p.wba }))}>
                  {showKeys.wba ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </ServiceCard>

      <ServiceCard
        title="כתובת Webhook n8n"
        icon={Webhook}
        iconColor="text-slate-500"
        config={existingN8n}
        onDelete={existingN8n ? () => deleteConfig.mutate(existingN8n.id) : undefined}
        onTest={handleTestWebhook}
        onSave={handleSaveN8n}
        saveLabel={existingN8n ? 'עדכן הגדרה' : 'שמור הגדרה'}
        savingId="n8n"
        testingId="n8n"
        value="n8n"
        serviceKey="n8n"
      >
        {existingN8n && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30 space-y-1">
            <KeyDisplay label="Webhook URL" value={existingN8n.webhook_url || '-'} id="n8n_url" />
            {existingN8n.api_key && existingN8n.api_key !== 'none' && (
              <KeyDisplay label="Auth Token" value={existingN8n.api_key} id="n8n_key" />
            )}
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">כתובת Webhook מרכזית</Label>
            <Input placeholder="https://n8n.your-domain.com/webhook/..." value={n8nWebhookUrl} onChange={(e) => setN8nWebhookUrl(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">מפתח אימות (אופציונלי)</Label>
            <div className="relative">
              <Input placeholder="Bearer token..." type={showKeys.n8n ? 'text' : 'password'} value={n8nApiKey} onChange={(e) => setN8nApiKey(e.target.value)} dir="ltr" className="pl-9" />
              <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKeys((p) => ({ ...p, n8n: !p.n8n }))}>
                {showKeys.n8n ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </ServiceCard>

      <ServiceCard
        title="019 SMS"
        icon={Send}
        iconColor="text-purple-500"
        config={existingSms}
        onDelete={existingSms ? () => deleteConfig.mutate(existingSms.id) : undefined}
        onTest={handleTestSms}
        onSave={handleSaveSms}
        saveLabel={existingSms ? 'עדכן הגדרה' : 'שמור הגדרה'}
        savingId="sms"
        testingId="sms"
        value="sms"
        serviceKey="sms"
      >
        {existingSms && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30 space-y-1">
            <KeyDisplay label="שם משתמש" value={existingSms.api_key.split(':')[0] || ''} id="sms_user" />
            <KeyDisplay label="סיסמה" value={existingSms.api_key.split(':')[1] || ''} id="sms_pass" />
            <KeyDisplay label="שולח (Sender)" value={existingSms.api_key.split(':').slice(2).join(':') || '—'} id="sms_sender" />
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">שם משתמש</Label>
            <Input placeholder="username" value={smsUser} onChange={(e) => setSmsUser(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">סיסמה</Label>
            <div className="relative">
              <Input placeholder="••••••••" type={showKeys.sms ? 'text' : 'password'} value={smsPass} onChange={(e) => setSmsPass(e.target.value)} dir="ltr" className="pl-9" />
              <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKeys((p) => ({ ...p, sms: !p.sms }))}>
                {showKeys.sms ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">שולח / Sender ID</Label>
            <Input
              placeholder="לדוגמה: Realtyz או מספר משרד מאושר"
              value={smsSender}
              onChange={(e) => setSmsSender(e.target.value)}
              dir="ltr"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              יש להזין את שם/מספר השולח שאושר על ידי 019 כ-SMS-capable בחשבונך. ללא שולח מאושר, 019 תדחה את השליחה.
            </p>
          </div>
        </div>
      </ServiceCard>

      <ServiceCard
        title="Mapbox (מפה)"
        icon={Map}
        iconColor="text-blue-500"
        config={existingMapbox}
        onDelete={existingMapbox ? () => deleteConfig.mutate(existingMapbox.id) : undefined}
        onTest={() => {
          if (mapboxToken || existingMapbox?.api_key) {
            window.open('https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=' + (mapboxToken || existingMapbox?.api_key), '_blank');
          } else { toast.error('יש להזין Access Token'); }
        }}
        onSave={handleSaveMapbox}
        saveLabel={existingMapbox ? 'עדכן טוקן' : 'שמור טוקן'}
        testLabel="בדיקת טוקן"
        savingId="mapbox"
        testingId="mapbox"
        value="mapbox"
        serviceKey="mapbox"
      >
        {existingMapbox && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
            <KeyDisplay label="Access Token" value={existingMapbox.api_key} id="mapbox_current" />
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs">{existingMapbox ? 'עדכון Access Token' : 'Access Token חדש'}</Label>
          <div className="relative">
            <Input placeholder="pk.eyJ1Ijoi..." type={showKeys.mapbox ? 'text' : 'password'} value={mapboxToken} onChange={(e) => setMapboxToken(e.target.value)} dir="ltr" className="pl-9" />
            <Button variant="ghost" size="icon" className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowKeys((p) => ({ ...p, mapbox: !p.mapbox }))}>
              {showKeys.mapbox ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">ניתן להשיג מ- <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener" className="underline">mapbox.com</a></p>
        </div>
      </ServiceCard>

        </Accordion>
      </SectionShell>

      {isSuperAdmin && (
        <SectionShell title="מידע לסופר-אדמין · Super Admin" subtitle="ניקוי Ayrshare וכלי אבחון פנימיים">
          <AyrshareProfilePurgeCard />
          <AyrshareBulkPurgeCard />
        </SectionShell>
      )}
    </div>
    </ApiSettingsCtx.Provider>
  );
};




export default ApiSettings;
