import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BillingTab from '@/components/profile/BillingTab';
import KnowledgeBase from '@/pages/KnowledgeBase';
import { LaunchPromoBanner } from '@/components/billing/LaunchPromoBanner';
import { ReferralProgramCard } from '@/components/referrals/ReferralProgramCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Trash2, Pencil, Mail, Phone, MessageCircle, MapPin, User as UserIcon,
  Building2, ImageIcon, LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { supabase } from '@/integrations/supabase/client';
import { IsraeliCityPicker } from '@/components/IsraeliCityPicker';
import { ConnectionsTab } from '@/components/profile/ConnectionsTab';
import { WhatsAppGatewayCard } from '@/components/profile/WhatsAppGatewayCard';
import { WhatsAppConnectionModeCard } from '@/components/settings/WhatsAppConnectionModeCard';
import { ListingPortalsCard } from '@/components/profile/ListingPortalsCard';
import { VoiceGatewayCard } from '@/components/profile/VoiceGatewayCard';
import { EmailAliasCard } from '@/components/profile/EmailAliasCard';
import { ProfileAvatarUploader } from '@/components/profile/ProfileAvatarUploader';
import { ManagersTab } from '@/components/profile/ManagersTab';
import { cn } from '@/lib/utils';
import { DEMO_EXIT_PENDING_KEY } from '@/lib/demoGuard';

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

/** Synthetic WhatsApp-login emails are internal only and must never be shown. */
function realEmail(value: unknown): string {
  const email = String(value ?? '').trim();
  if (!email || /@(?:whatsapp\.)?realtyz\.local$/i.test(email)) return '';
  return email;
}

function PersonalTab() {
  const { user, signOut } = useAuth();
  const [emails, setEmails] = useState<Row[]>([newRow(realEmail(user?.email))]);
  const [whatsapps, setWhatsapps] = useState<Row[]>([newRow('')]);
  const [phones, setPhones] = useState<Row[]>([newRow('')]);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState<string>('');
  const [brokerLicense, setBrokerLicense] = useState<string>('');
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, any>;
    const contacts = meta.profile_contacts ?? null;
    const userPhone = ((user as any).phone ?? meta.phone_number ?? meta.phone ?? '').toString();
    const defaultName = String(meta.full_name || meta.name || '').trim();
    const apply = (p: any, fallback: any = {}) => {
      setEmails(rowList(
        Array.isArray(p.emails) ? p.emails.filter((it: any) => realEmail(typeof it === 'string' ? it : it?.value)) : p.emails,
        [realEmail(p.email) || realEmail(fallback.email) || realEmail(user.email)].filter(Boolean),
      ));
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
          .select('email, full_name, phone, city, gender, broker_license_number')
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
        const contactEmails = Array.isArray(contacts?.emails)
          ? contacts.emails.map((item: any) => (typeof item === 'string' ? item : item?.value)).filter(Boolean)
          : [];
        const contactsBelongToUser = contactEmails.length > 0 && !!user.email && contactEmails.includes(user.email);
        if (local) apply(local, serverProfile);
        else if (contactsBelongToUser) apply(contacts, serverProfile);
        else apply(serverProfile);
        if (data) {
          if (typeof (data as any).broker_license_number === 'string') {
            setBrokerLicense((data as any).broker_license_number ?? '');
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
          email: realEmail(emails[0]?.value) || null,
          broker_license_number: brokerLicense.trim() || null,
        })
        .eq('id', user!.id);
      toast.success('הפרופיל נשמר');
    } catch (err: any) {
      toast.error('שמירה לשרת נכשלה: ' + (err?.message ?? 'שגיאה'));
    }
  };

  const handleSignOut = async () => {
    window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
    window.localStorage.setItem('realtyz-demo-mode', 'false');
    window.localStorage.setItem('realtyz-authenticated-session', 'false');
    await signOut();
    window.location.replace('/auth');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-right"></CardTitle>
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
              placeholder="הזן שם מלא"
              className="text-center text-base font-bold max-w-xs"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEdit('fullName')}
                className="text-base font-bold hover:text-primary"
              >
                {fullName || 'הזן שם מלא'}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={() => setEdit('fullName')}
                aria-label="עריכת שם מלא"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
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

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save} size="lg" className="flex-1">שמירת הפרופיל</Button>
          <Button type="button" onClick={handleSignOut} variant="outline" size="lg" className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" />
            התנתקות
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}

function WorkspaceTab() {
  const { user } = useAuth();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { refresh: refreshBrand } = useWhiteLabel();
  const ownerId = activeWorkspaceId ?? user?.id ?? null;
  const isOwner = !!user?.id && !!ownerId && user.id === ownerId;

  const [agencyName, setAgencyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [landscapeLogoUrl, setLandscapeLogoUrl] = useState('');
  const [serviceAreaRows, setServiceAreaRows] = useState<Row[]>([newRow('')]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load shared workspace branding from white_label_settings keyed by the workspace owner.
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from('white_label_settings')
          .select('agency_name, logo_url, landscape_logo_url')
          .eq('user_id', ownerId)
          .maybeSingle();
        if (cancelled) return;
        setAgencyName((data as any)?.agency_name || activeWorkspace?.workspace_name || 'רילטיז נדל"ן');
        setLogoUrl((data as any)?.logo_url || activeWorkspace?.workspace_logo_url || '');
        setLandscapeLogoUrl((data as any)?.landscape_logo_url || '');

        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('city, service_areas')
          .eq('id', ownerId)
          .maybeSingle();
        if (cancelled) return;
        setServiceAreaRows(rowList((ownerProfile as any)?.service_areas, [(ownerProfile as any)?.city || ''].filter(Boolean)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ownerId, activeWorkspace?.workspace_name, activeWorkspace?.workspace_logo_url]);

  const onLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'square' | 'landscape') => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!isOwner) { toast.error('רק בעל החשבון יכול לעדכן את לוגו המשרד'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('הקובץ גדול מדי (מקסימום 5MB)'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/${kind}-logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('agency-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('agency-logos').getPublicUrl(path);
      if (kind === 'square') setLogoUrl(pub.publicUrl);
      else setLandscapeLogoUrl(pub.publicUrl);
      const { error: wlErr } = await (supabase as any)
        .from('white_label_settings')
        .upsert({
          user_id: user.id,
          agency_name: agencyName || null,
          logo_url: kind === 'square' ? pub.publicUrl : logoUrl || null,
          landscape_logo_url: kind === 'landscape' ? pub.publicUrl : landscapeLogoUrl || null,
        } as any, { onConflict: 'user_id' });
      if (wlErr) throw wlErr;
      if (kind === 'square') { try { window.localStorage.setItem(LOGO_STORAGE_KEY, pub.publicUrl); } catch {} }
      await refreshBrand();
      toast.success('הלוגו הועלה ושותף לכל חברי המשרד');
    } catch (err: any) {
      toast.error(err?.message || 'שגיאה בהעלאת הלוגו');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeLogo = async (kind: 'square' | 'landscape') => {
    if (!isOwner || !user?.id) return;
    if (kind === 'square') setLogoUrl('');
    else setLandscapeLogoUrl('');
    await (supabase as any)
      .from('white_label_settings')
      .upsert({
        user_id: user.id,
        logo_url: kind === 'square' ? null : logoUrl || null,
        landscape_logo_url: kind === 'landscape' ? null : landscapeLogoUrl || null,
      } as any, { onConflict: 'user_id' });
    if (kind === 'square') { try { window.localStorage.removeItem(LOGO_STORAGE_KEY); } catch {} }
    await refreshBrand();
    toast.success('הלוגו הוסר');
  };

  const save = async () => {
    if (!isOwner || !user?.id) { toast.error('רק בעל החשבון יכול לשמור את פרטי המשרד'); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('white_label_settings')
          .upsert({ user_id: user.id, agency_name: agencyName || null, logo_url: logoUrl || null, landscape_logo_url: landscapeLogoUrl || null } as any, { onConflict: 'user_id' });
      if (error) throw error;
      const serviceAreas = serviceAreaRows.map((r) => r.value.trim()).filter(Boolean);
      await supabase.from('profiles').update({ service_areas: serviceAreas } as any).eq('id', user.id);
      await supabase.auth.updateUser({ data: { agency_name: agencyName, service_areas: serviceAreas } });
      try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ agency_name: agencyName, service_areas: serviceAreas })); } catch {}
      await refreshBrand();
      toast.success('פרטי המשרד נשמרו ושותפו לכל חברי המשרד');
    } catch (err: any) {
      toast.error(err?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right flex items-center justify-between gap-2">
          <span></span>
          {!isOwner && (
            <span className="text-[11px] font-normal text-muted-foreground">לצפייה בלבד · מנוהל ע״י בעל החשבון</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card/40 p-3 text-right">
          <LogoBox title="לוגו ריבוע" url={logoUrl} disabled={!isOwner || uploading} aspect="square" onUpload={(e) => onLogoUpload(e, 'square')} onRemove={() => removeLogo('square')} />
          <LogoBox title="לוגו מלבן" url={landscapeLogoUrl} disabled={!isOwner || uploading} aspect="landscape" onUpload={(e) => onLogoUpload(e, 'landscape')} onRemove={() => removeLogo('landscape')} />
          </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>שם המשרד</span>
            </div>
            <Input dir="rtl" value={agencyName} disabled={!isOwner || loading} onChange={(e) => setAgencyName(e.target.value)} className="h-9 text-right text-sm font-semibold" />
          </div>

          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>אזורי שירות</span>
              {isOwner && (
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => setServiceAreaRows([...serviceAreaRows, newRow('')])} aria-label="הוסף אזור שירות">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {isOwner ? (
              <div className="space-y-2">
                {serviceAreaRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-1.5">
                    <IsraeliCityPicker value={row.value} onChange={(v) => setServiceAreaRows(serviceAreaRows.map((r) => r.id === row.id ? { ...r, value: v } : r))} placeholder="בחר עיר / אזור" />
                    {serviceAreaRows.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setServiceAreaRows(serviceAreaRows.filter((r) => r.id !== row.id))} aria-label="הסר אזור שירות">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Input dir="rtl" value={serviceAreaRows.map((r) => r.value).filter(Boolean).join(', ')} disabled className="h-9 text-right text-sm" />
            )}
          </div>
        </div>
        {isOwner && (
          <Button onClick={save} size="lg" className="w-full" disabled={saving || loading}>
            {saving ? 'שומר…' : 'שמירת פרטי המשרד'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LogoBox({ title, url, disabled, aspect, onUpload, onRemove }: {
  title: string;
  url: string;
  disabled: boolean;
  aspect: 'square' | 'landscape';
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  const inputId = useMemo(() => `logo-${aspect}-${crypto.randomUUID()}`, [aspect]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-bold text-muted-foreground">{title}</label>
        {url && !disabled && (
          <button type="button" onClick={onRemove} className="text-destructive hover:bg-destructive/10 rounded-sm p-1" aria-label={`מחק ${title}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <label className={cn('flex cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-background transition hover:bg-accent/40', aspect === 'square' ? 'aspect-square' : 'aspect-[16/7]', disabled && 'pointer-events-none opacity-60')} htmlFor={inputId}>
        {url ? <img src={url} alt={title} className="h-full w-full object-contain" /> : <ImageIcon className="h-7 w-7 text-muted-foreground/50" />}
      </label>
      <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onUpload} disabled={disabled} />
    </div>
  );
}


export default function Profile() {
  const [params, setParams] = useSearchParams();
  const { activeWorkspace } = useWorkspace();
  // Managers are only relevant for agencies with multiple brokers.
  const isAgency = (activeWorkspace?.account_type ?? '').toLowerCase() === 'agency';
  const tab = params.get('tab') ?? 'personal';
  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  return (
    <div dir="rtl" className="mx-auto w-full max-w-4xl space-y-4 p-2 sm:p-4">
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className={`grid w-full ${isAgency ? 'grid-cols-6' : 'grid-cols-5'} mb-[15px]`}>
          <TabsTrigger value="personal">פרופיל</TabsTrigger>
          <TabsTrigger value="workspace">המשרד</TabsTrigger>
          <TabsTrigger value="aibrain">AI, AI brain</TabsTrigger>
          <TabsTrigger value="connections">חיבורים</TabsTrigger>
          <TabsTrigger value="billing">חבילה</TabsTrigger>
          {isAgency && <TabsTrigger value="managers">מנהלים</TabsTrigger>}
        </TabsList>
        <TabsContent value="personal" className="mt-[20px] space-y-4">
          <PersonalTab />
        </TabsContent>
        <TabsContent value="aibrain" className="mt-[20px] space-y-4" dir="rtl">
          <KnowledgeBase />
        </TabsContent>
        {isAgency && (
          <TabsContent value="managers" className="mt-[20px] space-y-4">
            <ManagersTab />
          </TabsContent>
        )}
        <TabsContent value="workspace" className="mt-[20px] space-y-4">
          <WorkspaceTab />
        </TabsContent>
        <TabsContent value="connections" className="mt-[20px] space-y-4" dir="rtl">
          <ConnectionsTab />
        </TabsContent>
        <TabsContent value="billing" className="mt-[20px] space-y-4" dir="rtl">
          <LaunchPromoBanner />
          <BillingTab />
          <ReferralProgramCard />
        </TabsContent>

      </Tabs>
    </div>
  );
}
