import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Sparkles, Mail, Phone, MessageCircle, Building2, MapPin, User as UserIcon, Briefcase, Upload, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { IsraeliCityPicker } from '@/components/IsraeliCityPicker';
import { WhatsAppGatewayCard } from '@/components/profile/WhatsAppGatewayCard';
import { ListingPortalsCard } from '@/components/profile/ListingPortalsCard';
import { VoiceGatewayCard } from '@/components/profile/VoiceGatewayCard';
import { ProfileAvatarUploader } from '@/components/profile/ProfileAvatarUploader';
import { cn } from '@/lib/utils';


type ContactList = { id: string; value: string }[];

const newRow = (value = ''): ContactList[number] => ({ id: crypto.randomUUID(), value });

function ContactArrayEditor({
  label,
  icon: Icon,
  rows,
  onChange,
  placeholder,
  type = 'text',
  dir = 'rtl',
}: {
  label: string;
  icon: typeof Mail;
  rows: ContactList;
  onChange: (next: ContactList) => void;
  placeholder: string;
  type?: string;
  dir?: 'rtl' | 'ltr';
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">{label}</Label>
      </div>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              type={type}
              dir={dir}
              placeholder={placeholder}
              value={row.value}
              onChange={(e) =>
                onChange(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))
              }
              className={dir === 'ltr' ? 'text-left' : 'text-right'}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange([...rows, newRow()])}
              aria-label="הוסף שורה"
              className="text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              disabled={rows.length === 1 && idx === 0}
              aria-label="מחיקה"
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiSparkleSwitch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card/50 p-3">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-full transition-all',
            checked ? 'bg-emerald-500/15 ring-2 ring-emerald-400/60 shadow-[0_0_18px_-4px_hsl(142_70%_45%/0.7)]' : 'bg-muted',
          )}
        >
          <Sparkles className={cn('h-4 w-4 transition-colors', checked ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground')} />
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">סוכן AI אוטונומי</p>
          <p className="text-xs text-muted-foreground">מענה אוטומטי, ניסוח טיוטות והמלצות חכמות</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn(
          'data-[state=checked]:bg-emerald-500',
          'data-[state=unchecked]:bg-muted-foreground/40',
        )}
      />
    </div>
  );
}

const WORKSPACE_STORAGE_KEY = 'realtyz-workspace-details';
const LOGO_STORAGE_KEY = 'realtyz-agency-logo';

function WorkspaceTab() {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const { data: onboarding } = useQuery({
    queryKey: ['profile-onboarding-state', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('onboarding_state')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
  });

  const initialValues = useMemo(() => {
    const base = {
      agency_name: meta.agency_name || 'ריאלטיז נדל"ן',
      manager: 'אודי ויטמן',
      tone: onboarding?.tone || 'מקצועי',
      service_areas: meta.service_areas || 'מרכז הארץ',
      initial_message: onboarding?.initial_message || '',
    };
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) return { ...base, ...JSON.parse(raw) };
    } catch {}
    return base;
    // Depend on primitives only so this does NOT re-create on every render.
  }, [meta.agency_name, meta.service_areas, onboarding?.tone, onboarding?.initial_message]);

  const [values, setValues] = useState(initialValues);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate exactly once after onboarding loads, then never overwrite user input again.
  useEffect(() => {
    if (hydrated) return;
    setValues(initialValues);
    try {
      const savedLogo = window.localStorage.getItem(LOGO_STORAGE_KEY);
      if (savedLogo) setLogoUrl(savedLogo);
    } catch {}
    setHydrated(true);
  }, [initialValues, hydrated]);

  const update = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const onLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('הקובץ גדול מדי (מקסימום 5MB)');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('agency-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('agency-logos').getPublicUrl(path);
      const url = pub.publicUrl;
      setLogoUrl(url);
      window.localStorage.setItem(LOGO_STORAGE_KEY, url);
      toast.success('הלוגו הועלה בהצלחה');
    } catch (err: any) {
      toast.error(err?.message || 'שגיאה בהעלאת הלוגו');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeLogo = () => {
    setLogoUrl('');
    window.localStorage.removeItem(LOGO_STORAGE_KEY);
    toast.success('הלוגו הוסר');
  };

  const save = () => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(values));
    toast.success('פרטי המשרד נשמרו');
  };

  const fields: { key: keyof typeof values; icon: typeof Mail; label: string }[] = [
    { key: 'agency_name', icon: Building2, label: 'שם המשרד' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right">פרטי המשרד והסוכנות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-card/40 p-3 text-right">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            <span>לוגו המשרד</span>
          </div>
          <div className="flex items-center gap-3 flex-row-reverse">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background">
              {logoUrl ? (
                <img src={logoUrl} alt="לוגו המשרד" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={onLogoUpload}
                  disabled={uploading}
                />
                <span className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium cursor-pointer hover:bg-accent transition-colors',
                  uploading && 'opacity-50 pointer-events-none',
                )}>
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'מעלה...' : logoUrl ? 'החלפת לוגו' : 'העלאת לוגו'}
                </span>
              </label>
              {logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={removeLogo} className="text-destructive hover:bg-destructive/10 self-start">
                  <Trash2 className="h-3.5 w-3.5 ml-1" />
                  הסר לוגו
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP או SVG. עד 5MB.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => {
            const Icon = f.icon;
            return (
              <div key={String(f.key)} className="rounded-lg border bg-card/40 p-3 text-right">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{f.label}</span>
                </div>
                <Input
                  dir="rtl"
                  value={values[f.key]}
                  onChange={update(f.key)}
                  className="h-9 text-right text-sm font-semibold"
                />
              </div>
            );
          })}

          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>אזורי שירות</span>
            </div>
            <IsraeliCityPicker
              value={values.service_areas}
              onChange={(v) => setValues((s) => ({ ...s, service_areas: v }))}
              placeholder="בחר עיר / אזור"
            />
          </div>
        </div>
        <Button onClick={save} size="lg" className="w-full">שמירת פרטי המשרד</Button>
      </CardContent>
    </Card>
  );
}

function PersonalTab() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<ContactList>([newRow(user?.email ?? '')]);
  const [whatsapps, setWhatsapps] = useState<ContactList>([newRow('')]);
  const [phones, setPhones] = useState<ContactList>([newRow('')]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [fullName, setFullName] = useState('אודי ויטמן');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from auth user_metadata first (cross-device), then fall back to
  // localStorage so older sessions don't lose their phone numbers.
  useEffect(() => {
    if (hydrated || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, any>;
    const contacts = meta.profile_contacts ?? null;
    let loaded = false;
    if (contacts && typeof contacts === 'object') {
      if (Array.isArray(contacts.emails) && contacts.emails.length) setEmails(contacts.emails);
      if (Array.isArray(contacts.whatsapps) && contacts.whatsapps.length) setWhatsapps(contacts.whatsapps);
      if (Array.isArray(contacts.phones) && contacts.phones.length) setPhones(contacts.phones);
      if (typeof contacts.aiEnabled === 'boolean') setAiEnabled(contacts.aiEnabled);
      if (typeof contacts.fullName === 'string') setFullName(contacts.fullName);
      loaded = true;
    }
    if (!loaded) {
      try {
        const raw = window.localStorage.getItem('realtyz-profile-contacts');
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p.emails) && p.emails.length) setEmails(p.emails);
          if (Array.isArray(p.whatsapps) && p.whatsapps.length) setWhatsapps(p.whatsapps);
          if (Array.isArray(p.phones) && p.phones.length) setPhones(p.phones);
          if (typeof p.aiEnabled === 'boolean') setAiEnabled(p.aiEnabled);
          if (typeof p.fullName === 'string') setFullName(p.fullName);
        }
      } catch {}
    }
    setHydrated(true);
  }, [user, hydrated]);

  const save = async () => {
    const payload = { emails, whatsapps, phones, aiEnabled, fullName };
    // Local cache for instant rehydration.
    try {
      window.localStorage.setItem('realtyz-profile-contacts', JSON.stringify(payload));
    } catch {}
    // Cross-device durable store: auth user_metadata.
    try {
      const { error } = await supabase.auth.updateUser({ data: { profile_contacts: payload } });
      if (error) throw error;
      toast.success('הפרופיל נשמר');
    } catch (err: any) {
      toast.error('שמירה מקומית הצליחה, אך שמירה לשרת נכשלה: ' + (err?.message ?? 'שגיאה'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right">הפרופיל האישי שלי</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ProfileAvatarUploader />

        <div className="space-y-2">
          <Label htmlFor="full-name" className="text-right text-sm">שם מלא להצגה</Label>
          <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="text-right" dir="rtl" />
        </div>

        <ContactArrayEditor
          label="כתובות מייל"
          icon={Mail}
          rows={emails}
          onChange={setEmails}
          placeholder="name@example.com"
          type="email"
          dir="ltr"
        />
        <ContactArrayEditor
          label="מספרי WhatsApp"
          icon={MessageCircle}
          rows={whatsapps}
          onChange={setWhatsapps}
          placeholder="05X-XXXXXXX"
          type="tel"
          dir="ltr"
        />
        <ContactArrayEditor
          label="טלפונים נוספים"
          icon={Phone}
          rows={phones}
          onChange={setPhones}
          placeholder="05X-XXXXXXX"
          type="tel"
          dir="ltr"
        />

        <AiSparkleSwitch checked={aiEnabled} onCheckedChange={setAiEnabled} />

        <Button onClick={save} className="w-full" size="lg">
          שמירת הפרופיל
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'personal';

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  return (
    <div dir="rtl" className="mx-auto w-full max-w-4xl space-y-4 p-2 sm:p-4">
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-3 mb-[15px]">
          <TabsTrigger value="personal">הפרופיל</TabsTrigger>
          <TabsTrigger value="workspace">המשרד</TabsTrigger>
          <TabsTrigger value="connections">חיבורים</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-[20px] space-y-4">
          <PersonalTab />
        </TabsContent>
        <TabsContent value="workspace" className="mt-[20px]"><WorkspaceTab /></TabsContent>
        <TabsContent value="connections" className="mt-[20px] space-y-4">
          <WhatsAppGatewayCard />
          <VoiceGatewayCard />
          <ListingPortalsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
