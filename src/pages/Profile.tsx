import { DeleteAccountButton } from '@/components/profile/DeleteAccountButton';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CompleteProfileBanner } from '@/components/profile/CompleteProfileBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KnowledgeBase from '@/pages/KnowledgeBase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Trash2, Pencil, Mail, Phone, MessageCircle, MapPin, User as UserIcon,
  Building2, ImageIcon, LogOut, X,
} from 'lucide-react';
import { BadgeCheck } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/i18n/personalToast';
import { useAuth } from '@/hooks/useAuth';
import { personalGenderKey, profileGender, usePersonalLanguage } from '@/i18n/personalLanguage';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { RITA_WORKSPACE_OWNER_ID } from '@/config/workspaceMode';
import { supabase } from '@/integrations/supabase/client';
import { IsraeliCityPicker } from '@/components/IsraeliCityPicker';
import { ConnectionsTab } from '@/components/profile/ConnectionsTab';
import { WhatsAppGatewayCard } from '@/components/profile/WhatsAppGatewayCard';
import { WhatsAppConnectionModeCard } from '@/components/settings/WhatsAppConnectionModeCard';
import { ListingPortalsCard } from '@/components/profile/ListingPortalsCard';
import { VoiceGatewayCard } from '@/components/profile/VoiceGatewayCard';
import { EmailAliasCard } from '@/components/profile/EmailAliasCard';
import { ProfileAvatarUploader } from '@/components/profile/ProfileAvatarUploader';
import { ImageCropDialog } from '@/components/profile/ImageCropDialog';
import { ManagersTab } from '@/components/profile/ManagersTab';
import { cn } from '@/lib/utils';
import { DEMO_EXIT_PENDING_KEY } from '@/lib/demoGuard';
import { useAccountIdentity } from '@/hooks/useAccountIdentity';
import { useUserRole } from '@/hooks/useUserRole';
import { UpgradeToBrokerButton } from '@/components/profile/UpgradeToBrokerButton';
import { BrokerLicenseField } from '@/components/auth/BrokerLicenseField';
import { verifyBrokerLicense } from '@/lib/brokerLicense';
import { friendlyUserDisplayName } from '@/lib/friendlyUserDisplayName';

type Row = { id: string; value: string };
const newRow = (value = ''): Row => ({ id: crypto.randomUUID(), value });

const WORKSPACE_STORAGE_KEY = 'realtyz-workspace-details';
const LOGO_STORAGE_KEY = 'realtyz-agency-logo';
const PROFILE_STORAGE_KEY = 'realtyz-profile-contacts';

const profileStorageKey = (workspaceOwnerId: string) => `${PROFILE_STORAGE_KEY}:${workspaceOwnerId}`;

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
  const { command } = usePersonalLanguage();
  return (
    <div
      dir="rtl"
      className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-right shadow-sm"
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconClass ?? 'text-primary')} />
      <span className="text-sm font-semibold text-muted-foreground shrink-0">{label}:</span>
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
              className={cn('h-8 px-2 !text-base font-bold placeholder:font-normal', inputDir === 'ltr' ? 'text-left' : 'text-right')}
            />
          )
        ) : (
          <Button variant="ghost"
            type="button"
            onClick={onToggleEdit}
            dir={inputDir}
            className={cn(
              'w-full truncate rounded px-1 py-0.5 text-base font-bold hover:bg-muted/50',
              inputDir === 'ltr' ? 'text-left' : 'text-right',
              !value && 'text-muted-foreground/60',
            )}
          >
            {value || command(placeholder) || '—'}
          </Button>
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

/** Synthetic phone/WhatsApp/SMS-login emails are internal only and must never be shown. */
function realEmail(value: unknown): string {
  const email = String(value ?? '').trim();
  if (!email || !email.includes('@')) return '';
  if (/\.(local|test|invalid)$/i.test(email) || /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org)|placeholder\.[a-z]+)$/i.test(email)) return '';
  // Phone-number local parts on our own domains are login placeholders.
  if (/^\+?\d{9,15}@(?:[a-z0-9-]+\.)*realtyz\./i.test(email)) return '';
  return email;
}

/** Email belongs to the account only when it signed in with email or Google. */
function hasRealEmailLogin(user: any): boolean {
  const providers: string[] = user?.app_metadata?.providers ?? [user?.app_metadata?.provider].filter(Boolean);
  return providers.includes('google') || (providers.includes('email') && !!realEmail(user?.email));
}

function PersonalTab() {
  const { user, signOut } = useAuth();
  const language = usePersonalLanguage();
  const queryClient = useQueryClient();
  const identity = useAccountIdentity();
  const { isSuperAdmin } = useUserRole();
  const { activeWorkspaceId } = useWorkspace();
  const profileOwnerId = activeWorkspaceId ?? user?.id ?? null;
  const isOwnProfile = profileOwnerId === user?.id;
  const [emails, setEmails] = useState<Row[]>([newRow('')]);
  const [whatsapps, setWhatsapps] = useState<Row[]>([newRow('')]);
  const [phones, setPhones] = useState<Row[]>([newRow('')]);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState<string>('');
  const [brokerLicense, setBrokerLicense] = useState<string>('');
  const [verifiedBrokerLicense, setVerifiedBrokerLicense] = useState<string | null>(null);
  const [storedLicense, setStoredLicense] = useState('');
  const [removeLicenseOpen, setRemoveLicenseOpen] = useState(false);
  const [removingLicense, setRemovingLicense] = useState(false);
  const [licenseSuspended, setLicenseSuspended] = useState(false);
  const showBrokerFields = identity.label === 'מתווך' || licenseSuspended;
  useEffect(() => {
    setLicenseSuspended(false);
    if (!profileOwnerId) return;
    let alive = true;
    void supabase.from('broker_role_suspensions').select('role').eq('user_id', profileOwnerId).then(({ data }) => {
      if (alive) setLicenseSuspended((data?.length ?? 0) > 0);
    });
    return () => { alive = false; };
  }, [profileOwnerId]);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profileOwnerId || hydratedFor === profileOwnerId) return;
    const ownerId = profileOwnerId;
    // Reset everything the moment the active workspace changes so nothing
    // from the previous tenant can linger on screen.
    setEmails([newRow('')]); setWhatsapps([newRow('')]); setPhones([newRow('')]);
    setFullName(''); setCity(''); setGender(''); setBrokerLicense(''); setStoredLicense('');
    const meta = isOwnProfile ? (user.user_metadata ?? {}) as Record<string, any> : {};
    const contacts = isOwnProfile ? meta.profile_contacts ?? null : null;
    const userPhone = isOwnProfile ? ((user as any).phone ?? meta.phone_number ?? meta.phone ?? '').toString() : '';
    const defaultName = isOwnProfile ? friendlyUserDisplayName(user, '') : '';
    const firstVal = (list: any) => {
      const it = Array.isArray(list) ? list[0] : null;
      return String((typeof it === 'string' ? it : it?.value) ?? '').trim().toLowerCase();
    };
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, email, full_name, phone, city, gender, broker_license_number')
          .eq('id', ownerId)
          .maybeSingle();
        if ((data as any)?.id && (data as any).id !== ownerId) return;
        const server: any = data ?? {};
        const loginEmail = isOwnProfile && hasRealEmailLogin(user) ? realEmail(user.email) : '';
        // A profile email equal to a placeholder auth email is never shown.
        const storedEmail = realEmail(server.email);
        const serverEmail = (storedEmail && (storedEmail.toLowerCase() !== String(user.email ?? '').toLowerCase() || loginEmail) ? storedEmail : '') || loginEmail;
        const serverName = friendlyUserDisplayName({ user_metadata: { full_name: server.full_name, name: defaultName } }, '');
        let local: any = null;
        try {
          const raw = window.localStorage.getItem(profileStorageKey(ownerId));
          if (raw) local = JSON.parse(raw);
        } catch {}
        // A cached/metadata contact card is trusted only if it belongs to this
        // exact account (same primary email AND same name). Otherwise discard.
        const owns = (p: any) => !!p && !!serverEmail
          && firstVal(p.emails) === serverEmail.toLowerCase()
          && (!serverName || String(p.fullName ?? p.full_name ?? '').trim() === serverName);
        const extra = owns(local) ? local : owns(contacts) ? contacts : null;
        if (!extra && local) { try { window.localStorage.removeItem(profileStorageKey(ownerId)); } catch {} }
        const phone = String(server.phone ?? '') || userPhone;
        setEmails(rowList(extra?.emails, [serverEmail].filter(Boolean)));
        setWhatsapps(rowList(extra?.whatsapps, [phone].filter(Boolean)));
        setPhones(rowList(extra?.phones, [phone].filter(Boolean)));
        setFullName(serverName);
        setCity(String(server.city ?? extra?.city ?? ''));
        setGender(profileGender(server.gender) ?? '');
        setBrokerLicense(String(server.broker_license_number ?? ''));
        setStoredLicense(String(server.broker_license_number ?? '').trim());
      } catch { /* ignore */ }
      setHydratedFor(ownerId);
    })();
  }, [user, profileOwnerId, isOwnProfile, hydratedFor]);

  const verifiedLicenseLocked = showBrokerFields && isOwnProfile && !licenseSuspended && !!storedLicense;
  const removeLicense = async () => {
    setRemovingLicense(true);
    try {
      const { error } = isOwnProfile
        ? await supabase.rpc('remove_my_broker_license' as any)
        : await supabase.rpc('admin_remove_broker_license' as any, { _user_id: profileOwnerId });
      if (error) throw error;
      setStoredLicense(''); setBrokerLicense(''); setVerifiedBrokerLicense(null);
      setRemoveLicenseOpen(false);
      await queryClient.invalidateQueries();
      toast.success('רישיון התיווך הוסר. החשבון חזר להרשאות משתמש רגיל.');
    } catch (err: any) {
      toast.error('הסרת הרישיון נכשלה: ' + (err?.message ?? 'שגיאה'));
    } finally { setRemovingLicense(false); }
  };

  const setEdit = (k: string) => setEditing((e) => ({ ...e, [k]: !e[k] }));

  const save = async () => {
    const payload = { emails, whatsapps, phones, fullName, city };
    if (!profileOwnerId) return;
    try {
      if (showBrokerFields && brokerLicense && isOwnProfile && !verifiedLicenseLocked) await verifyBrokerLicense(brokerLicense, 'verify');
      const primaryPhone = whatsapps[0]?.value || phones[0]?.value || null;
      const { data: savedProfile, error: profErr } = await supabase
        .from('profiles')
        .update({
          city: city || null,
          gender: profileGender(gender),
          phone: primaryPhone,
          full_name: fullName || null,
          email: realEmail(emails[0]?.value) || null,
          ...(showBrokerFields && !verifiedLicenseLocked ? { broker_license_number: brokerLicense.trim() || null } : {}),
        } as any)
        .eq('id', profileOwnerId).select('id,gender').single();
      if (profErr) throw profErr;
      if (!savedProfile || savedProfile.id !== profileOwnerId) throw new Error('הפרופיל לא נשמר');
      if (isOwnProfile && user) queryClient.setQueryData(personalGenderKey(user.id), profileGender(savedProfile.gender));
      try { window.localStorage.setItem(profileStorageKey(profileOwnerId), JSON.stringify(payload)); } catch {}
      if (isOwnProfile) {
        const { error } = await supabase.auth.updateUser({ data: { profile_contacts: payload, full_name: fullName } });
        if (error) throw error;
      }
      toast.success('הפרופיל נשמר');
      void queryClient.invalidateQueries({ queryKey: ['app-header-user-profile'] });
      setLicenseSuspended(false);
      window.dispatchEvent(new Event('realtyz:license-verified'));
      window.dispatchEvent(new Event('realtyz:profile-saved'));
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
      <CardContent className="space-y-3 pb-3">
        <ProfileAvatarUploader profileOwnerId={profileOwnerId} gender={gender === 'female' ? 'female' : gender === 'male' ? 'male' : null} />

        {verifiedLicenseLocked ? (
          <div dir="rtl" className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-right shadow-sm">
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">שם מלא:</span>
            <span className="min-w-0 flex-1 break-words text-base font-bold" aria-label="שם מלא לפי פנקס המתווכים">{fullName}</span>
          </div>
        ) : (
          <ProfileFieldRow icon={UserIcon} label="שם מלא" value={fullName} editing={editing.fullName ?? false} onChange={setFullName} onToggleEdit={() => setEdit('fullName')} inputDir="rtl" placeholder="הזן שם מלא" />
        )}
        {verifiedLicenseLocked && <p className="text-sm text-muted-foreground">השם נלקח מפנקס המתווכים הרשמי ואינו ניתן לעריכה</p>}


        <ProfileArrayRows rows={emails} setRows={setEmails} icon={Mail} label='דוא"ל' />
        <ProfileArrayRows rows={whatsapps} setRows={setWhatsapps} icon={MessageCircle} label="וואטסאפ" formatter={formatIsraeliPhone} />
        <ProfileArrayRows rows={phones} setRows={setPhones} icon={Phone} label="טלפון" formatter={formatIsraeliPhone} />

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
          <IsraeliCityPicker value={city} onChange={(v) => { setCity(v); setEdit('city'); }} placeholder="בחר עיר" className="text-base" itemClassName="text-base" />
        </ProfileFieldRow>

        <ProfileFieldRow
          icon={UserIcon}
          label="מגדר"
          value={gender === 'male' ? 'גבר' : gender === 'female' ? 'אישה' : ''}
          editing={editing.gender ?? false}
          onChange={setGender}
          onToggleEdit={() => setEdit('gender')}
          inputDir="rtl"
          placeholder={language.command('בחר מגדר')}
        >
          <Select value={gender || undefined} onValueChange={(v) => { setGender(v); setEdit('gender'); }}>
            <SelectTrigger dir="rtl" className="h-8 text-right text-base"><SelectValue placeholder={language.command('בחר מגדר')} /></SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="male" className="text-right text-base">גבר</SelectItem>
              <SelectItem value="female" className="text-right text-base">אישה</SelectItem>
            </SelectContent>
          </Select>
        </ProfileFieldRow>

        {showBrokerFields && isOwnProfile && licenseSuspended && <div role="alert" className="border border-destructive bg-destructive/10 p-3 text-destructive">מספר הרישיון אינו תקף או אינו מופיע בפנקס המתווכים המורשים. הרשאות התיווך הושעו עד לאימות רישיון תקף.</div>}
        {verifiedLicenseLocked ? (
          <div dir="rtl" className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-right shadow-sm">
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">מספר רישיון תיווך:</span>
            <div className="min-w-0 flex-1">
              <span className="block truncate rounded px-1 py-0.5 text-left text-base font-bold tabular-nums" dir="ltr" aria-label="מספר רישיון תיווך מאומת">{storedLicense}</span>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10" aria-label="הסרת רישיון התיווך" onClick={() => setRemoveLicenseOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : showBrokerFields && (isOwnProfile ? <BrokerLicenseField value={brokerLicense} onChange={setBrokerLicense} onVerified={setVerifiedBrokerLicense} /> : (
          <div dir="rtl" className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-right shadow-sm">
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">מספר רישיון תיווך:</span>
            <div className="min-w-0 flex-1">
              <span className="block truncate rounded px-1 py-0.5 text-left text-base font-bold tabular-nums" dir="ltr" aria-label="מספר רישיון תיווך">{brokerLicense || '—'}</span>
            </div>
            {isSuperAdmin && !!brokerLicense && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10" aria-label="הסרת רישיון התיווך" onClick={() => setRemoveLicenseOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}

      </CardContent>

      <AlertDialog open={removeLicenseOpen} onOpenChange={(o) => !removingLicense && setRemoveLicenseOpen(o)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>להסיר את רישיון התיווך?</AlertDialogTitle>
            <AlertDialogDescription>
              {isOwnProfile
                ? 'הסרת הרישיון תבטל מיד את סטטוס המתווך המאומת שלך. החשבון יחזור לתצוגה ולהרשאות של משתמש רגיל, כולל אובדן הגישה לעמלות סגירה ולכלי התיווך. כדי לחזור תצטרך לאמת רישיון מחדש.'
                : 'הסרת הרישיון תבטל מיד את סטטוס המתווך המאומת של משתמש זה. החשבון יחזור לתצוגה ולהרשאות של משתמש רגיל, כולל אובדן הגישה לעמלות סגירה ולכלי התיווך. כדי לחזור יידרש לאמת רישיון מחדש.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            <AlertDialogCancel disabled={removingLicense}>ביטול</AlertDialogCancel>
            <AlertDialogAction disabled={removingLicense} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); void removeLicense(); }}>
              {removingLicense ? 'מסיר…' : 'הסרת הרישיון'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="profile-sticky-actions sticky bottom-0 z-20 flex items-center gap-3 rounded-b-xl border-t border-border bg-card px-4 pb-4 pt-3">
        {user && <DeleteAccountButton />}
        <Button type="button" onClick={handleSignOut} variant="outline" size="lg" className="flex-1 text-base border-destructive/30 text-destructive hover:bg-destructive/10">
          <LogOut className="h-4 w-4" />
          התנתקות
        </Button>
        <Button onClick={save} disabled={showBrokerFields && isOwnProfile && !verifiedLicenseLocked && !!brokerLicense && verifiedBrokerLicense !== brokerLicense} size="lg" className="flex-1 text-base">שמירת הפרופיל</Button>
      </div>

    </Card>
  );
}

function WorkspaceTab() {
  const queryClient = useQueryClient();
  const identity = useAccountIdentity();
  const company = ['יזם', 'קבלן'].includes(identity.label);
  const { user } = useAuth();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { refresh: refreshBrand } = useWhiteLabel();
  const ownerId = activeWorkspaceId ?? user?.id ?? null;

  const [agencyName, setAgencyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [landscapeLogoUrl, setLandscapeLogoUrl] = useState('');
  const [officeDetails, setOfficeDetails] = useState({ office_address: '', public_email: '', brokerage_name: '', brokerage_license: '' });
  const isMasterOffice = ownerId === RITA_WORKSPACE_OWNER_ID;
  const [serviceAreaRows, setServiceAreaRows] = useState<Row[]>([newRow('')]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingLogo, setPendingLogo] = useState<{ file: File; kind: 'square' | 'landscape'; ownerId: string } | null>(null);

  useEffect(() => { setPendingLogo(null); }, [ownerId]);

  // Load shared workspace branding from white_label_settings keyed by the workspace owner.
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from('white_label_settings')
          .select('agency_name, logo_url, landscape_logo_url, office_address, public_email, brokerage_name, brokerage_license')
          .eq('user_id', ownerId)
          .maybeSingle();
        if (cancelled) return;
        setAgencyName((data as any)?.agency_name || (['שותף', 'פרטי', 'מפרסם'].includes(identity.label) ? '' : activeWorkspace?.workspace_name) || '');
        setLogoUrl((data as any)?.logo_url || activeWorkspace?.workspace_logo_url || '');
        setLandscapeLogoUrl((data as any)?.landscape_logo_url || '');
        setOfficeDetails({ office_address: data?.office_address || '', public_email: data?.public_email || '', brokerage_name: data?.brokerage_name || '', brokerage_license: data?.brokerage_license || '' });

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

  const onLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, kind: 'square' | 'landscape') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !ownerId) return;
    if (!file.type.startsWith('image/')) { toast.error('יש לבחור קובץ תמונה (PNG, JPG, SVG או WEBP)'); return; }
    if (file.size === 0) { toast.error('הקובץ ריק – נסו לבחור תמונה אחרת'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('הקובץ גדול מדי (מקסימום 5MB)'); return; }
    setPendingLogo({ file, kind, ownerId });
  };

  const uploadCroppedLogo = async (file: File) => {
    if (!pendingLogo || !ownerId || pendingLogo.ownerId !== ownerId) return;
    const { kind } = pendingLogo;
    setUploading(true);
    try {
      const path = `${ownerId}/${kind}-logo-${Date.now()}.png`;

      const { error: upErr } = await supabase.storage
        .from('agency-logos')
        .upload(path, file, { upsert: true, contentType: file.type || undefined, cacheControl: '3600' });
      if (upErr) throw new Error(`העלאת הקובץ נכשלה: ${upErr.message}`);

      const { data: pub } = supabase.storage.from('agency-logos').getPublicUrl(path);
      const publicUrl = typeof pub?.publicUrl === 'string' ? pub.publicUrl : '';
      if (!publicUrl.startsWith('http')) throw new Error('לא הצלחנו לקבל כתובת ציבורית לתמונה');

      const nextSquare = kind === 'square' ? publicUrl : (logoUrl || null);
      const nextLandscape = kind === 'landscape' ? publicUrl : (landscapeLogoUrl || null);

      const { error: wlErr } = await (supabase as any)
        .from('white_label_settings')
        .upsert({
          user_id: ownerId,
          agency_name: agencyName || null,
          logo_url: nextSquare,
          landscape_logo_url: nextLandscape,
        } as any, { onConflict: 'user_id' });
      if (wlErr) throw new Error(`שמירת הלוגו נכשלה: ${wlErr.message}`);

      if (kind === 'square') setLogoUrl(publicUrl); else setLandscapeLogoUrl(publicUrl);
      if (kind === 'square') { try { window.localStorage.setItem(LOGO_STORAGE_KEY, publicUrl); } catch {} }
      await refreshBrand();
      setPendingLogo(null);
      toast.success('הלוגו הועלה ושותף לכל חברי המשרד');
    } catch (err: any) {
      toast.error('שגיאה בהעלאת הלוגו', { description: err?.message || 'נסו שוב או בחרו קובץ אחר' });
    } finally {
      setUploading(false);
    }
  };


  const removeLogo = async (kind: 'square' | 'landscape') => {
    if (!ownerId) return;
    const prevSquare = logoUrl;
    const prevLandscape = landscapeLogoUrl;
    if (kind === 'square') setLogoUrl('');
    else setLandscapeLogoUrl('');
    try {
      const { error } = await (supabase as any)
        .from('white_label_settings')
        .upsert({
          user_id: ownerId,
          agency_name: agencyName || null,
          logo_url: kind === 'square' ? null : prevSquare || null,
          landscape_logo_url: kind === 'landscape' ? null : prevLandscape || null,
        } as any, { onConflict: 'user_id' });
      if (error) throw error;
      if (kind === 'square') { try { window.localStorage.removeItem(LOGO_STORAGE_KEY); } catch {} }
      await refreshBrand();
      toast.success('הלוגו הוסר');
    } catch (err: any) {
      if (kind === 'square') setLogoUrl(prevSquare); else setLandscapeLogoUrl(prevLandscape);
      toast.error('הסרת הלוגו נכשלה', { description: err?.message || 'נסו שוב' });
    }
  };



  const save = async () => {
    if (!ownerId) { toast.error('לא נמצא מרחב עבודה פעיל'); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('white_label_settings')
          .upsert({ user_id: ownerId, agency_name: agencyName || null, logo_url: logoUrl || null, landscape_logo_url: landscapeLogoUrl || null, ...(isMasterOffice ? Object.fromEntries(Object.entries(officeDetails).map(([key, value]) => [key, value.trim() || null])) : {}) } as any, { onConflict: 'user_id' });
      if (error) throw error;
      const serviceAreas = [...new Set(serviceAreaRows.map((r) => r.value.trim()).filter(Boolean))];
      const { error: profileError } = await supabase.from('profiles').update({ service_areas: serviceAreas } as any).eq('id', ownerId);
      if (profileError) throw profileError;
      if (user?.id === ownerId) {
        await supabase.auth.updateUser({ data: { agency_name: agencyName, service_areas: serviceAreas } });
      }
      try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ agency_name: agencyName, service_areas: serviceAreas })); } catch {}
      await refreshBrand();
      window.dispatchEvent(new Event('realtyz:profile-saved'));
      void queryClient.invalidateQueries({ queryKey: ['service_areas', ownerId] });
      toast.success('פרטי המשרד נשמרו ושותפו לכל חברי המשרד');
    } catch (err: any) {
      toast.error(err?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pb-24">
        {pendingLogo && pendingLogo.ownerId === ownerId && (
          <ImageCropDialog file={pendingLogo.file} aspect={pendingLogo.kind === 'square' ? 1 : 16 / 7} title={pendingLogo.kind === 'square' ? 'חיתוך לוגו ריבוע' : 'חיתוך לוגו מלבן'} onCancel={() => setPendingLogo(null)} onConfirm={uploadCroppedLogo} />
        )}
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card/40 p-3 text-right">
          <LogoBox title="לוגו ריבוע" url={logoUrl} disabled={uploading} aspect="square" onUpload={(e) => onLogoUpload(e, 'square')} onRemove={() => removeLogo('square')} />
          <LogoBox title="לוגו מלבן" url={landscapeLogoUrl} disabled={uploading} aspect="landscape" onUpload={(e) => onLogoUpload(e, 'landscape')} onRemove={() => removeLogo('landscape')} />
          </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>{company ? 'שם החברה' : ['מפרסם', 'פרטי', 'שותף'].includes(identity.label) ? 'שם לתצוגה (לא חובה)' : 'שם המשרד'}</span>
            </div>
            <Input dir="rtl" value={agencyName} disabled={loading} onChange={(e) => setAgencyName(e.target.value)} className="h-9 text-right text-base font-bold" />
          </div>

          <div className="rounded-lg border bg-card/40 p-3 text-right">
            <div className="mb-1.5 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>אזורי שירות</span>
            </div>
            <div className="space-y-2">
              <IsraeliCityPicker
                value=""
                onChange={() => {}}
                selectedValues={serviceAreaRows.map(row => row.value).filter(Boolean)}
                onSelectionChange={values => setServiceAreaRows(values.map(value => newRow(value)))}
                firstOptions={['כל הארץ']}
                placeholder="אזורי שירות"
                className="text-base"
                itemClassName="text-base"
              />
              <div className="flex min-h-9 flex-wrap gap-1.5">
                {serviceAreaRows.filter((row) => row.value).map((row) => (
                  <span key={row.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm font-medium text-foreground">
                    {row.value}
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => setServiceAreaRows(serviceAreaRows.filter((item) => item.id !== row.id))} aria-label={`הסר ${row.value}`}>
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {isMasterOffice && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([['office_address', 'כתובת המשרד'], ['public_email', 'דוא״ל ציבורי'], ['brokerage_name', 'שם המתווך האחראי'], ['brokerage_license', 'רישיון תיווך']] as const).map(([key, label]) => <div key={key} className="space-y-1.5">
            <label htmlFor={`office-${key}`} className="text-xs text-muted-foreground">{label}</label>
            <Input id={`office-${key}`} type={key === 'public_email' ? 'email' : 'text'} dir={key === 'public_email' || key === 'brokerage_license' ? 'ltr' : 'rtl'} value={officeDetails[key]} disabled={loading} onChange={(event) => setOfficeDetails((previous) => ({ ...previous, [key]: event.target.value }))} />
          </div>)}
        </div>}
        <div className="fixed bottom-[var(--app-footer-space)] left-1/2 z-30 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 border-t border-border bg-background p-3 lg:w-[var(--app-content-width)]">
        <Button onClick={save} size="lg" className="w-full text-[17px]" disabled={saving || loading}>
          {saving ? 'שומר…' : 'שמירת פרטי המשרד'}
        </Button>
        </div>
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
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const identity = useAccountIdentity();
  const { canInviteTeam } = useUserRole();
  const officeLabel = ['יזם', 'קבלן'].includes(identity.label) ? 'חברה' : ['מפרסם', 'פרטי', 'שותף'].includes(identity.label) ? 'פרטי מפרסם' : 'משרד';
  // Managers are only relevant for agencies with multiple brokers.
  const isAgency = canInviteTeam && identity.label === 'מתווך' && (activeWorkspace?.account_type ?? '').toLowerCase() === 'agency';
  const tab = params.get('tab') === 'billing' ? 'personal' : params.get('tab') ?? 'personal';
  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  /* One-time nudge to train the AI brain, after the profile is saved
     or when the new user moves off the personal tab for the first time. */
  const brainKey = activeWorkspaceId ? `rz-ai-brain-prompt:${activeWorkspaceId}` : null;
  const [brainPrompt, setBrainPrompt] = useState(false);
  const brainSeen = () => !brainKey || window.localStorage.getItem(brainKey) === '1';
  const openBrainPrompt = () => {
    if (brainSeen()) return;
    if (brainKey) window.localStorage.setItem(brainKey, '1');
    setBrainPrompt(true);
  };

  /* Google OAuth callback result: surface success / failure as a toast. */
  const googleQueryClient = useQueryClient();
  useEffect(() => {
    const g = params.get('google');
    if (!g) return;
    if (g === 'connected') {
      const acc = params.get('google_account');
      toast.success('חיבור Google הושלם', { description: acc || undefined });
      // The row was just written for the active workspace: drop the cached
      // "not connected" answer so the cards never show a false failure.
      void googleQueryClient.invalidateQueries({ queryKey: ['google-service-conn'] });
      void googleQueryClient.invalidateQueries({ queryKey: ['google-services-status'] });
      void googleQueryClient.invalidateQueries({ queryKey: ['google-calendar-conn'] });
    } else {
      toast.error('חיבור Google נכשל', {
        description: params.get('google_reason') || 'נסו להתחבר שוב',
      });
    }
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('google_reason');
    next.delete('google_account');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('google')]);

  useEffect(() => {
    const onSaved = () => openBrainPrompt();
    window.addEventListener('realtyz:profile-saved', onSaved);
    return () => window.removeEventListener('realtyz:profile-saved', onSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainKey]);

  const handleTabChange = (v: string) => {
    setTab(v);
    if (v !== 'personal' && v !== 'aibrain' && params.get('welcome') === '1') openBrainPrompt();
  };

  return (
    <div dir="rtl" className="mx-auto w-full max-w-4xl space-y-4 p-2 sm:p-4 [&_input]:text-lg md:[&_input]:text-base [&_input]:font-bold [&_input]:placeholder:font-normal [&_textarea]:text-lg md:[&_textarea]:text-base">
      <Dialog open={brainPrompt} onOpenChange={setBrainPrompt}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>נאמן את מוח ה-AI שלך</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              כדי שה-AI יעבוד בדיוק בסטייל שלך, הזינו מידע על הפרסונה, המטרות,
              האסטרטגיה, סטייל הכתיבה וכללי התקשורת שלכם.
            </p>
            <p>
              אפשר גם להיעזר ב-AI עצמו: הוא יבצע מחקר ויבנה את הפרסונות
              המושלמות עבור סביבת העבודה, הנישה ומאגר הידע שלכם.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setBrainPrompt(false)}>אחר כך</Button>
            <Button
              onClick={() => { setBrainPrompt(false); setTab('aibrain'); }}
            >
              לאימון מוח ה-AI
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-3">
        <CompleteProfileBanner force={params.get('welcome') === 'developer'} />
      </div>
      <UpgradeToBrokerButton key={activeWorkspaceId ?? user?.id ?? 'broker-upgrade'} profileOwnerId={activeWorkspaceId ?? user?.id} />

      <Tabs value={tab} onValueChange={handleTabChange} dir="rtl">
        <TabsList className={`sticky top-0 z-30 grid w-full ${isAgency ? 'grid-cols-5' : 'grid-cols-4'} mb-[15px] bg-muted`}>
          <TabsTrigger className="text-base" value="personal">פרופיל</TabsTrigger>
          <TabsTrigger className="text-base" value="workspace">{officeLabel}</TabsTrigger>
          <TabsTrigger className="text-base" value="aibrain">מח AI</TabsTrigger>
          <TabsTrigger className="text-base" value="connections">חיבורים</TabsTrigger>
          {isAgency && <TabsTrigger className="text-base" value="managers">מנהלים</TabsTrigger>}
        </TabsList>
        <TabsContent value="personal" className="mt-[20px] space-y-4">
          <PersonalTab key={activeWorkspaceId ?? user?.id ?? 'profile'} />
        </TabsContent>
        <TabsContent value="aibrain" className="mt-[20px] space-y-4" dir="rtl">
          <KnowledgeBase key={activeWorkspaceId ?? user?.id ?? 'brain'} />
        </TabsContent>
        {isAgency && (
          <TabsContent value="managers" className="mt-[20px] space-y-4">
            <ManagersTab key={activeWorkspaceId ?? user?.id ?? 'managers'} />
          </TabsContent>
        )}
        <TabsContent value="workspace" className="mt-[20px] space-y-4">
          <WorkspaceTab key={activeWorkspaceId ?? user?.id ?? 'workspace'} />
        </TabsContent>
        <TabsContent value="connections" className="mt-[20px] space-y-4" dir="rtl">
          <ConnectionsTab key={activeWorkspaceId ?? user?.id ?? 'connections'} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
