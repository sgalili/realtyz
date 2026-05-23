import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { KeyRound, ChevronDown, ExternalLink, ShieldAlert, Check, Save } from 'lucide-react';

/**
 * Super-Admin Platform Credentials.
 *
 * Single page to add / rotate every API credential the platform needs.
 * Each platform is one collapsed card with: an instructions panel (toggle),
 * a link to where to fetch the keys, and the input fields. Values save to
 * the existing `api_configs` table via the `manage-api-configs` edge fn.
 *
 * NOTE: Vapi / 11Labs / OpenAI keys also need to live as Supabase secrets
 * (server-side env) to be readable from edge functions. This page mirrors
 * them into api_configs as a single source of truth for the admin UI; the
 * actual edge functions still read process env at runtime.
 */

type Field = { name: string; label: string; placeholder?: string; type?: 'text' | 'password' };
type Platform = {
  id: string;             // api_configs.service_name
  label: string;
  hint: string;           // short tagline shown collapsed
  link?: { url: string; label: string };
  instructions: string[]; // bullet list
  fields: Field[];        // when multiple, packed as "field1:field2:..." in api_key
};

const PLATFORMS: Platform[] = [
  {
    id: 'Vapi',
    label: 'Vapi (חיוג AI)',
    hint: 'מנוע חיוג קולי אוטונומי – נדרש למודול חייגן ה-AI.',
    link: { url: 'https://dashboard.vapi.ai/', label: 'פתח לוח Vapi' },
    instructions: [
      'התחבר/הירשם ב-Vapi Dashboard.',
      'תחת API Keys – צור Private Key (משמש לקריאות שרת-לשרת).',
      'תחת Phone Numbers – העתק את ה-UUID של המספר שאושר.',
    ],
    fields: [
      { name: 'api_key', label: 'Vapi Private API Key', type: 'password' },
      { name: 'phone_id', label: 'Phone Number ID (UUID)', placeholder: 'dc4d9fd8-...' },
    ],
  },
  {
    id: 'ElevenLabs',
    label: 'ElevenLabs (קול AI)',
    hint: 'מנוע סינתזת קול לדיבור הסוכן הקולי.',
    link: { url: 'https://elevenlabs.io/app/settings/api-keys', label: 'מפתחות ב-ElevenLabs' },
    instructions: [
      'היכנס ל-ElevenLabs → Settings → API Keys.',
      'צור מפתח חדש או העתק קיים.',
      'בוחר Voice ID מתוך Voice Lab (העתק מ-Voice details).',
    ],
    fields: [
      { name: 'api_key', label: 'ElevenLabs API Key', type: 'password' },
      { name: 'voice_id', label: 'Voice ID', placeholder: 'xeyWdsOOLrNAAaGf4Y8m' },
    ],
  },
  {
    id: 'OpenAI',
    label: 'OpenAI (גיבוי AI)',
    hint: 'גיבוי GPT למקרה שה-Lovable AI Gateway לא זמין.',
    link: { url: 'https://platform.openai.com/api-keys', label: 'OpenAI API Keys' },
    instructions: [
      'platform.openai.com → API Keys → Create new secret key.',
      'אופציונלי – נדרש רק אם רוצים גיבוי לקריאות LLM ישירות.',
    ],
    fields: [{ name: 'api_key', label: 'OpenAI API Key', type: 'password' }],
  },
  {
    id: 'Green API',
    label: 'WhatsApp – Green API',
    hint: 'גייטוויי WhatsApp לא-רשמי לשליחה וקבלה.',
    link: { url: 'https://console.green-api.com/', label: 'Green API Console' },
    instructions: [
      'צור Instance חדש ב-Green API Console.',
      'העתק Instance ID ואת ה-API Token.',
    ],
    fields: [
      { name: 'instance', label: 'Instance ID' },
      { name: 'token', label: 'API Token', type: 'password' },
    ],
  },
  {
    id: '019 SMS',
    label: 'SMS – 019',
    hint: 'גייטוויי 019 לשליחת SMS משולחים מאומתים בישראל.',
    link: { url: 'https://019sms.co.il/', label: 'אזור אישי 019' },
    instructions: [
      'התחבר לחשבון 019 שלך ובקש הפעלת XML API.',
      'העתק שם משתמש וסיסמת API (לא הסיסמה הרגילה).',
    ],
    fields: [
      { name: 'username', label: 'שם משתמש 019' },
      { name: 'password', label: 'סיסמת API', type: 'password' },
    ],
  },
  {
    id: 'Twilio',
    label: 'Twilio (גיבוי קולי / SMS)',
    hint: 'משמש לתשתית IVR ושיחות יוצאות בגיבוי לוופי.',
    link: { url: 'https://console.twilio.com/', label: 'Twilio Console' },
    instructions: [
      'Twilio Console → Account → API keys & tokens.',
      'הכן Account SID ו-Auth Token.',
    ],
    fields: [
      { name: 'account_sid', label: 'Account SID' },
      { name: 'auth_token', label: 'Auth Token', type: 'password' },
    ],
  },
  {
    id: 'Resend',
    label: 'Resend (אימייל טרנזקציוני)',
    hint: 'שליחת אימיילים מערכתיים וטפסים ללקוחות.',
    link: { url: 'https://resend.com/api-keys', label: 'Resend API Keys' },
    instructions: ['Resend → API Keys → Create.', 'הוסף דומיין מאומת כדי לשלוח מ-realtyz.co.il.'],
    fields: [{ name: 'api_key', label: 'Resend API Key', type: 'password' }],
  },
  {
    id: 'Meta Ads',
    label: 'Meta Ads (Facebook / Instagram)',
    hint: 'נדרש להפעלת קמפיינים ממומנים ולמשיכת מטריקות.',
    link: { url: 'https://business.facebook.com/settings/system-users', label: 'Meta Business Settings' },
    instructions: [
      'Meta Business Suite → System Users → צור Access Token עם הרשאות ads_management.',
      'הוסף את ה-Ad Account ID (act_xxxx).',
    ],
    fields: [
      { name: 'access_token', label: 'Access Token', type: 'password' },
      { name: 'ad_account_id', label: 'Ad Account ID' },
    ],
  },
  {
    id: 'Mapbox',
    label: 'Mapbox (מפות וגיאוקודינג)',
    hint: 'משמש להצגת מפות נכסים ולחיפוש כתובות.',
    link: { url: 'https://account.mapbox.com/access-tokens/', label: 'Mapbox Tokens' },
    instructions: ['Mapbox → Account → Access Tokens.', 'צור Public Token עם scope ברירת מחדל.'],
    fields: [{ name: 'access_token', label: 'Mapbox Public Token', type: 'password' }],
  },
  {
    id: 'Homely',
    label: 'Homely (CRM חיצוני)',
    hint: 'דחיפה אוטומטית של לידים לכרטיסיית Homely OpenCard.',
    link: { url: 'https://www.homely.co.il/', label: 'אתר Homely' },
    instructions: ['פנה לתמיכת Homely לקבלת Client Code ומפתח API.'],
    fields: [
      { name: 'client_code', label: 'Client Code' },
      { name: 'api_key', label: 'API Key', type: 'password' },
    ],
  },
];

type Row = { service_name: string; api_key: string | null; is_active: boolean };

export default function PlatformCredentials() {
  const { isSuperAdmin, loading } = useUserRole();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [actives, setActives] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openHelp, setOpenHelp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('manage-api-configs', { method: 'GET' });
        if (error) throw error;
        const map: Record<string, Row> = {};
        const v: Record<string, Record<string, string>> = {};
        const a: Record<string, boolean> = {};
        for (const r of (data as Row[]) ?? []) {
          map[r.service_name] = r;
          const platform = PLATFORMS.find((p) => p.id === r.service_name);
          if (platform) {
            const parts = (r.api_key ?? '').split(':');
            const fieldValues: Record<string, string> = {};
            platform.fields.forEach((f, i) => { fieldValues[f.name] = parts[i] ?? ''; });
            v[r.service_name] = fieldValues;
            a[r.service_name] = !!r.is_active;
          }
        }
        setRows(map); setValues(v); setActives(a);
      } catch (e: any) {
        toast.error(`טעינת הגדרות נכשלה: ${e?.message ?? e}`);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  if (loading || busy) {
    return (
      <div className="container max-w-3xl py-8 space-y-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const save = async (platform: Platform) => {
    setSaving(platform.id);
    try {
      const parts = platform.fields.map((f) => (values[platform.id]?.[f.name] ?? '').trim());
      const api_key = parts.join(':');
      const { error } = await supabase.functions.invoke('manage-api-configs', {
        method: 'POST',
        body: {
          service_name: platform.id,
          api_key,
          is_active: actives[platform.id] ?? true,
        },
      });
      if (error) throw error;
      toast.success(`${platform.label} נשמר`);
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">מפתחות וחיבורים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ניהול מרוכז של כל מפתחות ה-API והסיסמאות שמפעילים את המערכת.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" /> Super Admin בלבד</Badge>
      </div>

      {PLATFORMS.map((platform) => {
        const isOpen = !!open[platform.id];
        const isHelpOpen = !!openHelp[platform.id];
        const configured = !!rows[platform.id]?.api_key;
        return (
          <Card key={platform.id} className="overflow-hidden">
            <Collapsible open={isOpen} onOpenChange={(v) => setOpen((s) => ({ ...s, [platform.id]: v }))}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2 truncate">
                        {platform.label}
                        {configured && (
                          <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
                            <Check className="h-3 w-3" /> מוגדר
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{platform.hint}</p>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <Collapsible open={isHelpOpen} onOpenChange={(v) => setOpenHelp((s) => ({ ...s, [platform.id]: v }))}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                        <ChevronDown className={`h-3 w-3 transition-transform ${isHelpOpen ? 'rotate-180' : ''}`} />
                        הוראות חיבור
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                        <ol className="list-decimal pr-5 space-y-1 text-xs text-muted-foreground">
                          {platform.instructions.map((line, i) => <li key={i}>{line}</li>)}
                        </ol>
                        {platform.link && (
                          <a href={platform.link.url} target="_blank" rel="noreferrer"
                             className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> {platform.link.label}
                          </a>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <div className="space-y-3">
                    {platform.fields.map((f) => (
                      <div key={f.name} className="space-y-1.5">
                        <Label htmlFor={`${platform.id}-${f.name}`}>{f.label}</Label>
                        <Input
                          id={`${platform.id}-${f.name}`}
                          type={f.type ?? 'text'}
                          dir="ltr"
                          placeholder={f.placeholder}
                          value={values[platform.id]?.[f.name] ?? ''}
                          onChange={(e) => setValues((s) => ({
                            ...s,
                            [platform.id]: { ...(s[platform.id] ?? {}), [f.name]: e.target.value },
                          }))}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`${platform.id}-active`}
                        checked={actives[platform.id] ?? true}
                        onCheckedChange={(v) => setActives((s) => ({ ...s, [platform.id]: v }))}
                      />
                      <Label htmlFor={`${platform.id}-active`} className="text-xs cursor-pointer">
                        פעיל
                      </Label>
                    </div>
                    <Button size="sm" onClick={() => save(platform)} disabled={saving === platform.id}>
                      <Save className="ml-2 h-4 w-4" />
                      {saving === platform.id ? 'שומר...' : 'שמירה'}
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
