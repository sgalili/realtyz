import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Trash2, Pencil, Mail, Phone, MessageCircle, MapPin, User as UserIcon,
  Building2, Upload, ImageIcon, Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { IsraeliCityPicker } from '@/components/IsraeliCityPicker';
import { WhatsAppGatewayCard } from '@/components/profile/WhatsAppGatewayCard';
import { ListingPortalsCard } from '@/components/profile/ListingPortalsCard';
import { VoiceGatewayCard } from '@/components/profile/VoiceGatewayCard';
import { EmailAliasCard } from '@/components/profile/EmailAliasCard';
import { ProfileAvatarUploader } from '@/components/profile/ProfileAvatarUploader';
import { ManagersTab } from '@/components/profile/ManagersTab';
import { ServiceAreasPanel } from '@/components/settings/ServiceAreasPanel';
import { ConnectedWorkspaceCard } from '@/components/workspace/ConnectedWorkspaceCard';
import { cn } from '@/lib/utils';

type Row = { id: string; value: string };
const newRow = (value = ''): Row => ({ id: crypto.randomUUID(), value });

const WORKSPACE_STORAGE_KEY = 'realtyz-workspace-details';
const LOGO_STORAGE_KEY = 'realtyz-agency-logo';
const PROFILE_STORAGE_KEY = 'realtyz-profile-contacts';

const profileStorageKey = (userId: string) => `${PROFILE_STORAGE_KEY}:${userId}`;

function rowList(value: any, fallback: string[] = []): Row[] {
  const source = Array.isArray(value) && value.length ? value : fallback;
  const rows = source
    .map((item: any) => {
      const raw = typeof item === 'string' ? item : item?.value;
      return typeof raw === 'string' ? newRow(raw) : null;
    })
    .filter(Boolean) as Row[];
  return rows.length ? rows : [newRow('')];
}

function formatIsraeliPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if (digits.startsWith('972')) local = '0' + digits.slice(3);
  if (local.length === 10 && local.startsWith('05')) {
    return `${local.slice(0, 3)}-${local.slice(3)}`;
  }
  return raw;
}

/** KI-style single-row field: icon + label + value on right, edit/add/delete on left. */
function ProfileFieldRow({
  icon: Icon,
  iconClass,
  label,
  value,
  editing,
  onChange,
  onToggleEdit,
  onDelete,
  onAdd,
  placeholder,
  inputDir = 'ltr',
  children,
}: {
  icon: typeof Mail;
  iconClass?: string;
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  onToggleEdit: () => void;
  onDelete?: () => void;
  onAdd?: () => void;
  placeholder?: string;
  inputDir?: 'ltr' | 'rtl';
  children?: React.ReactNode;
}) {
  return (
    <div
      dir="rtl"
      className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-right shadow-sm"
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconClass ?? 'text-primary')} />
      <span className="text-xs font-semibold text-muted-foreground shrink-0">{label}:</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          children ?? (
            <Input
              autoFocus
              dir={inputDir}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onToggleEdit}
              placeholder={placeholder}
              className={cn('h-8 px-2 text-sm', inputDir === 'ltr' ? 'text-left' : 'text-right')}
            />
          )
        ) : (
          <button
            type="button"
            onClick={onToggleEdit}
            dir={inputDir}
            className={cn(
              'w-full truncate rounded px-1 py-0.5 text-sm font-medium hover:bg-muted/50',
              inputDir === 'ltr' ? 'text-left' : 'text-right',
              !value && 'text-muted-foreground/60',
            )}
          >
            {value || placeholder || '—'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onToggleEdit} aria-label="עריכה">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {onAdd && (
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={onAdd} aria-label="הוסף">
            <Plus className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onDelete} aria-label="מחק">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Renders a stack of rows (array field) with KI styling. */
function ProfileArrayRows({
  rows, setRows, icon, label, placeholder, inputDir = 'ltr', formatter,
}: {
  rows: Row[];
  setRows: (next: Row[]) => void;
  icon: typeof Mail;
  label: string;
  placeholder?: string;
  inputDir?: 'ltr' | 'rtl';
  formatter?: (v: string) => string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <ProfileFieldRow
          key={row.id}
          icon={icon}
          label={label}
          value={formatter ? formatter(row.value) : row.value}
          editing={editingId === row.id}
          onChange={(v) => setRows(rows.map((r) => (r.id === row.id ? { ...r, value: v } : r)))}
          onToggleEdit={() => setEditingId((id) => (id === row.id ? null : row.id))}
          onAdd={idx === rows.length - 1 ? () => setRows([...rows, newRow()]) : undefined}
          onDelete={rows.length > 1 ? () => setRows(rows.filter((r) => r.id !== row.id)) : undefined}
          placeholder={placeholder}
          inputDir={inputDir}
        />
      ))}
    </div>
  );
}

function PersonalTab() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<Row[]>([newRow(user?.email ?? '')]);
  const [whatsapps, setWhatsapps] = useState<Row[]>([newRow('')]);
  const [phones, setPhones] = useState<Row[]>([newRow('')]);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState<string>('');
  const [brokerLicense, setBrokerLicense] = useState<string>('');
  const [brokerByline, setBrokerByline] = useState<string>('');
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, any>;
    const contacts = meta.profile_contacts ?? null;
    const userPhone = ((user as any).phone ?? meta.phone_number ?? meta.phone ?? '').toString();
    const defaultName = meta.full_name || meta.name || user.email || userPhone || '';
    const apply = (p: any, fallback: any = {}) => {
      setEmails(rowList(p.emails, [p.email || fallback.email || user.email || ''].filter(Boolean)));
      setWhatsapps(rowList(p.whatsapps, [p.whatsapp || p.phone || fallback.phone || userPhone].filter(Boolean)));
      setPhones(rowList(p.phones, [p.phone || fallback.phone || userPhone].filter(Boolean)));
      if (typeof p.fullName === 'string') setFullName(p.fullName);
      else if (typeof p.full_name === 'string') setFullName(p.full_name);
      else setFullName(defaultName);
      if (typeof p.city === 'string') setCity(p.city);
      if (typeof p.gender === 'string') setGender(p.gender);
    };
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('email, full_name, phone, city, gender, broker_license_number, broker_byline')
          .eq('id', user!.id)
          .maybeSingle();
        let local: any = null;
        try {
          const raw = window.localStorage.getItem(profileStorageKey(user.id));
          if (raw) local = JSON.parse(raw);
        } catch {}
        const serverProfile = data ? {
          email: (data as any).email,
          full_name: (data as any).full_name,
          phone: (data as any).phone,
          city: (data as any).city,
          gender: (data as any).gender,
        } : {};
        if (local) apply(local, serverProfile);
        else if (contacts && typeof contacts === 'object') apply(contacts, serverProfile);
        else apply(serverProfile);
        if (data) {
          if (typeof (data as any).broker_license_number === 'string') {
            setBrokerLicense((data as any).broker_license_number ?? '');
          }
          if (typeof (data as any).broker_byline === 'string') {
            setBrokerByline((data as any).broker_byline ?? '');
          }
        }
      } catch { /* ignore */ }
      setHydrated(true);
    })();
  }, [user, hydrated]);

  const setEdit = (k: string) => setEditing((e) => ({ ...e, [k]: !e[k] }));

  const save = async () => {
    const payload = { emails, whatsapps, phones, fullName, city, gender };
    try { if (user?.id) window.localStorage.setItem(profileStorageKey(user.id), JSON.stringify(payload)); } catch {}
    try {
      const { error } = await supabase.auth.updateUser({ data: { profile_contacts: payload } });
      if (error) throw error;
      // Also mirror city/gender/phone to profiles for cross-device + workspace use.
      const primaryPhone = whatsapps[0]?.value || phones[0]?.value || null;
      await supabase
        .from('profiles')
        .update({
          city: city || null,
          gender: gender || null,
          phone: primaryPhone,
          full_name: fullName,
          broker_license_number: brokerLicense.trim() || null,
          broker_byline: brokerByline.trim() || null,
        })
        .eq('id', user!.id);
      toast.success('הפרופיל נשמר');
    } catch (err: any) {
      toast.error('שמירה לשרת נכשלה: ' + (err?.message ?? 'שגיאה'));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-right">הפרופיל האישי שלי</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProfileAvatarUploader />

        <div className="flex flex-col items-center gap-1 pb-1">
          {editing.fullName ? (
            <Input
              autoFocus
              dir="rtl"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setEdit('fullName')}
              className="text-center text-base font-bold max-w-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEdit('fullName')}
              className="text-base font-bold hover:text-primary"
            >
              {fullName}
            </button>
          )}
        </div>

        <ProfileArrayRows rows={emails} setRows={setEmails} icon={Mail} label='דוא"ל' placeholder="user@example.com" />
        <ProfileArrayRows rows={whatsapps} setRows={setWhatsapps} icon={MessageCircle} label="וואטסאפ" placeholder="054-0000000" formatter={formatIsraeliPhone} />
        <ProfileArrayRows rows={phones} setRows={setPhones} icon={Phone} label="טלפון" placeholder="054-0000000" formatter={formatIsraeliPhone} />

        <ProfileFieldRow
          icon={MapPin}
          label="עיר"
          value={city}
          editing={editing.city ?? false}
          onChange={setCity}
          onToggleEdit={() => setEdit('city')}
          inputDir="rtl"
          placeholder="בחר עיר"
        >
          <IsraeliCityPicker value={city} onChange={(v) => { setCity(v); setEdit('city'); }} placeholder="בחר עיר" />
        </ProfileFieldRow>

        <ProfileFieldRow
          icon={UserIcon}
          label="מגדר"
          value={gender === 'male' ? 'זכר' : gender === 'female' ? 'נקבה' : gender}
          editing={editing.gender ?? false}
          onChange={setGender}
          onToggleEdit={() => setEdit('gender')}
          inputDir="rtl"
          placeholder="בחר מגדר"
        >
          <Select value={gender || undefined} onValueChange={(v) => { setGender(v); setEdit('gender'); }}>
            <SelectTrigger dir="rtl" className="h-8 text-right text-sm"><SelectValue placeholder="בחר מגדר" /></SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="male" className="text-right">זכר</SelectItem>
              <SelectItem value="female" className="text-right">נקבה</SelectItem>
              <SelectItem value="other" className="text-right">אחר</SelectItem>
            </SelectContent>
          </Select>
        </ProfileFieldRow>

        <div className="space-y-1" dir="rtl">
          <label className="text-xs font-medium text-muted-foreground">מספר רישיון תיווך (יצורף אוטומטית לתחתית כל פוסט/הודעה)</label>
          <Input
            dir="rtl"
            value={brokerLicense}
            onChange={(e) => setBrokerLicense(e.target.value)}
            placeholder="לדוגמה: 3019283"
            className="text-right"
          />
        </div>

        <div className="space-y-1" dir="rtl">
          <label className="text-xs font-medium text-muted-foreground">חתימת מותג (תוצג מעל מספר הרישיון בתחתית כל פוסט מכירה)</label>
          <Input
            dir="rtl"
            value={brokerByline}
            onChange={(e) => setBrokerByline(e.target.value)}
            placeholder={'לדוגמה: אודי ויטמן, אנגלו-סכסון, הרצליה/רמה״ש'}
            className="text-right"
          />
          <p className="text-[11px] text-muted-foreground/80">משמש כחתימה הבלעדית; הפלטפורמה תסיר אוטומטית כל תואר כמו "נדל״ן" / "Real Estate" שיומצא ע״י ה-AI.</p>
        </div>





        <div className="flex items-center justify-between pt-1">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-muted-foreground/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/40">
            <Plus className="h-3.5 w-3.5" />
            הוסף פרופיל
          </button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Share2 className="h-3.5 w-3.5" />
            רשתות חברתיות
          </div>
        </div>

        <Button onClick={save} size="lg" className="w-full mt-2">שמירת הפרופיל</Button>

        <div className="pt-3">
          <ConnectedWorkspaceCard />
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceTab() {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const { data: onboarding } = useQuery({
    queryKey: ['profile-onboarding-state', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('onboarding_state').select('*').eq('user_id', user!.id).maybeSingle();
      return data;
    },
  });

  const initialValues = useMemo(() => {
    const base = {
      agency_name: meta.agency_name || 'ריאלטיז נדל"ן',
      service_areas: meta.service_areas || 'מרכז הארץ',
    };
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) return { ...base, ...JSON.parse(raw) };
    } catch {}
    return base;
  }, [meta.agency_name, meta.service_areas, onboarding?.tone, onboarding?.initial_message]);

  const [values, setValues] = useState(initialValues);
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    setValues(initialValues);
    try {
      const savedLogo = window.localStorage.getItem(LOGO_STORAGE_KEY);
      if (savedLogo) setLogoUrl(savedLogo);
    } catch {}
    setHydrated(true);
  }, [initialValues, hydrated]);

  const onLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('הקובץ גדול מדי (מקסימום 5MB)'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('agency-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('agency-logos').getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      window.localStorage.setItem(LOGO_STORAGE_KEY, pub.publicUrl);
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
              {logoUrl ? <img src={logoUrl} alt="לוגו המשרד" className="h-full w-full object-contain" /> : <ImageIcon className="h-7 w-7 text-muted-foreground/50" />}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label className="inline-flex">
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onLogoUpload} disabled={uploading} />
                <span className={cn('inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium cursor-pointer hover:bg-accent transition-colors', uploading && 'opacity-50 pointer-events-none')}>
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
          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>שם המשרד</span>
            </div>
            <Input dir="rtl" value={values.agency_name} onChange={(e) => setValues((v) => ({ ...v, agency_name: e.target.value }))} className="h-9 text-right text-sm font-semibold" />
          </div>

          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>אזורי שירות</span>
            </div>
            <IsraeliCityPicker value={values.service_areas} onChange={(v) => setValues((s) => ({ ...s, service_areas: v }))} placeholder="בחר עיר / אזור" />
          </div>
        </div>
        <Button onClick={save} size="lg" className="w-full">שמירת פרטי המשרד</Button>
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
        <TabsList className="grid w-full grid-cols-4 mb-[15px]">
          <TabsTrigger value="personal">פרופיל</TabsTrigger>
          <TabsTrigger value="managers">מנהלים</TabsTrigger>
          <TabsTrigger value="workspace">המשרד</TabsTrigger>
          <TabsTrigger value="connections">חיבורים</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-[20px] space-y-4">
          <PersonalTab />
        </TabsContent>
        <TabsContent value="managers" className="mt-[20px] space-y-4">
          <ManagersTab />
        </TabsContent>
        <TabsContent value="workspace" className="mt-[20px] space-y-4">
          <WorkspaceTab />
          <ServiceAreasPanel />
        </TabsContent>
        <TabsContent value="connections" className="mt-[20px] space-y-4">
          <WhatsAppGatewayCard />
          <VoiceGatewayCard />
          <EmailAliasCard />
          <ListingPortalsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
