import { DeleteAccountButton } from '@/components/profile/DeleteAccountButton';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  Building2, ImageIcon, LogOut, X, Check,
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
import { IsraeliCityPicker, normalizeCitySelection } from '@/components/IsraeliCityPicker';
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
import { profileFieldChange, type ProfileContacts, type ProfileSaveField } from '@/lib/profileFieldSave';
import { workspaceDetailPatch, type OfficeField } from '@/lib/workspaceDetailSave';

type Row = { id: string; value: string };
const newRow = (value = ''): Row => ({ id: crypto.randomUUID(), value });

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
  onSave,
  saving = false,
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
  onSave: () => Promise<boolean>;
  saving?: boolean;
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
      <span className="text-base font-semibold text-muted-foreground shrink-0">{label}:</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          children ?? (
            <Input
              autoFocus
              dir={inputDir}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void onSave(); } }}
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
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" disabled={saving} onClick={() => { if (editing) void onSave(); else onToggleEdit(); }} aria-label={editing ? `שמירת ${label}` : `עריכת ${label}`}>
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
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
  rows, setRows, icon, label, placeholder, inputDir = 'ltr', formatter, onSave, saving,
}: {
  rows: Row[];
  setRows: (next: Row[]) => void;
  icon: typeof Mail;
  label: string;
  placeholder?: string;
  inputDir?: 'ltr' | 'rtl';
  formatter?: (v: string) => string;
  onSave: (next: Row[]) => Promise<boolean>;
  saving: boolean;
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
          saving={saving}
          onSave={async () => { const ok = await onSave(rows); if (ok) setEditingId(null); return ok; }}
          onAdd={idx === rows.length - 1 ? () => { const added = newRow(); setRows([...rows, added]); setEditingId(added.id); } : undefined}
          onDelete={rows.length > 1 ? () => { const next = rows.filter((r) => r.id !== row.id); void onSave(next).then(ok => { if (ok) { setRows(next); setEditingId(null); } }); } : undefined}
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
  const profileOwnerId = activeWorkspaceId;
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
  const [lockedBrokerName, setLockedBrokerName] = useState('');
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
  const savedContacts = useRef<ProfileContacts>({ emails: [], whatsapps: [], phones: [], fullName: '', city: '' });
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const [savingField, setSavingField] = useState<ProfileSaveField | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!user || !profileOwnerId || hydratedFor === profileOwnerId) return;
    let cancelled = false;
    const ownerId = profileOwnerId;
    // Reset everything the moment the active workspace changes so nothing
    // from the previous tenant can linger on screen.
    setEmails([newRow('')]); setWhatsapps([newRow('')]); setPhones([newRow('')]);
    setFullName(''); setCity(''); setGender(''); setBrokerLicense(''); setStoredLicense(''); setLockedBrokerName('');
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
          .select('id, email, full_name, phone, city, gender, broker_license_number, locked_broker_name')
          .eq('id', ownerId)
          .maybeSingle();
        if (cancelled) return;
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
        const loadedEmails = rowList(extra?.emails, [serverEmail].filter(Boolean));
        const loadedWhatsapps = rowList(extra?.whatsapps, [phone].filter(Boolean));
        const loadedPhones = rowList(extra?.phones, [phone].filter(Boolean));
        savedContacts.current = { emails: loadedEmails, whatsapps: loadedWhatsapps, phones: loadedPhones, fullName: serverName, city: String(server.city ?? extra?.city ?? '') };
        setEmails(loadedEmails);
        setWhatsapps(loadedWhatsapps);
        setPhones(loadedPhones);
        setFullName(serverName);
        setLockedBrokerName(String(server.locked_broker_name ?? ''));
        setCity(String(server.city ?? extra?.city ?? ''));
        setGender(profileGender(server.gender) ?? '');
        setBrokerLicense(String(server.broker_license_number ?? ''));
        setStoredLicense(String(server.broker_license_number ?? '').trim());
      } catch { /* ignore */ }
      if (!cancelled) setHydratedFor(ownerId);
    })();
    return () => { cancelled = true; };
  }, [user, profileOwnerId, isOwnProfile, hydratedFor]);

  const verifiedLicenseLocked = !!lockedBrokerName || (showBrokerFields && isOwnProfile && !licenseSuspended && !!storedLicense);
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

  const saveField = async (field: ProfileSaveField, value: string | Row[]): Promise<boolean> => {
    if (!profileOwnerId || hydratedFor !== profileOwnerId || savingRef.current) return false;
    if (field === 'fullName' && verifiedLicenseLocked) return false;
    savingRef.current = true;
    setSavingField(field);
    try {
      if (field === 'brokerLicense') {
        if (!showBrokerFields || !isOwnProfile || verifiedLicenseLocked || verifiedBrokerLicense !== brokerLicense) return false;
        if (brokerLicense) await verifyBrokerLicense(brokerLicense, 'verify');
      }
      if (field === 'emails') {
        const rows = value as Row[];
        if (rows.some(row => row.value.trim() && !realEmail(row.value))) throw new Error('כתובת הדוא״ל אינה תקינה');
      }
      const { contacts: payload, patch } = profileFieldChange(field, value, savedContacts.current);
      const { data: savedProfile, error: profErr } = await supabase
        .from('profiles')
        .update(patch as any)
        .eq('id', profileOwnerId).select('id,gender').single();
      if (profErr) throw profErr;
      if (!savedProfile || savedProfile.id !== profileOwnerId) throw new Error('הפרופיל לא נשמר');
      if (!mounted.current) return false;
      savedContacts.current = payload;
      if (field === 'gender' && isOwnProfile && user) queryClient.setQueryData(personalGenderKey(user.id), profileGender(savedProfile.gender));
      try { window.localStorage.setItem(profileStorageKey(profileOwnerId), JSON.stringify(payload)); } catch {}
      if (isOwnProfile && field in payload) {
        const { error } = await supabase.auth.updateUser({ data: { profile_contacts: payload, ...(field === 'fullName' ? { full_name: payload.fullName } : {}) } });
        if (error) throw error;
      }
      if (!mounted.current) return false;
      setEditing(e => ({ ...e, [field]: false }));
      toast.success('השדה נשמר');
      void queryClient.invalidateQueries({ queryKey: ['app-header-user-profile'] });
      if (field === 'brokerLicense') window.dispatchEvent(new Event('realtyz:license-verified'));
      window.dispatchEvent(new Event('realtyz:profile-saved'));
      return true;
    } catch (err: any) {
      if (mounted.current) toast.error('שמירה לשרת נכשלה: ' + (err?.message ?? 'שגיאה'));
      return false;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSavingField(null);
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
    <div className="w-full min-w-0">
      <div className="space-y-3 pb-3">
        <ProfileAvatarUploader profileOwnerId={profileOwnerId} gender={gender === 'female' ? 'female' : gender === 'male' ? 'male' : null} />

        {verifiedLicenseLocked ? (
          <div dir="rtl" className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-right shadow-sm">
            <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 text-base font-semibold text-muted-foreground">שם מלא:</span>
            <span className="min-w-0 flex-1 break-words text-base font-bold" aria-label="שם מלא לפי פנקס המתווכים">{fullName}</span>
          </div>
        ) : (
          <ProfileFieldRow icon={UserIcon} label="שם מלא" value={fullName} editing={editing.fullName ?? false} onChange={setFullName} onToggleEdit={() => setEdit('fullName')} onSave={() => saveField('fullName', fullName)} saving={savingField !== null} inputDir="rtl" placeholder="הזן שם מלא" />
        )}
        {verifiedLicenseLocked && <p className="text-sm text-muted-foreground">השם נלקח מפנקס המתווכים הרשמי ואינו ניתן לעריכה</p>}


        <ProfileArrayRows rows={emails} setRows={setEmails} icon={Mail} label='דוא"ל' onSave={rows => saveField('emails', rows)} saving={savingField !== null} />
        <ProfileArrayRows rows={whatsapps} setRows={setWhatsapps} icon={MessageCircle} label="וואטסאפ" formatter={formatIsraeliPhone} onSave={rows => saveField('whatsapps', rows)} saving={savingField !== null} />
        <ProfileArrayRows rows={phones} setRows={setPhones} icon={Phone} label="טלפון" formatter={formatIsraeliPhone} onSave={rows => saveField('phones', rows)} saving={savingField !== null} />

        <ProfileFieldRow
          icon={MapPin}
          label="עיר"
          value={city}
          editing={editing.city ?? false}
          onChange={setCity}
          onToggleEdit={() => setEdit('city')}
          onSave={() => saveField('city', city)}
          saving={savingField !== null}
          inputDir="rtl"
          placeholder="בחר עיר"
        >
          <IsraeliCityPicker value={city} onChange={setCity} placeholder="בחר עיר" className="text-base" itemClassName="text-base" />
        </ProfileFieldRow>

        <ProfileFieldRow
          icon={UserIcon}
          label="מגדר"
          value={gender === 'male' ? 'גבר' : gender === 'female' ? 'אישה' : ''}
          editing={editing.gender ?? false}
          onChange={setGender}
          onToggleEdit={() => setEdit('gender')}
          onSave={() => saveField('gender', gender)}
          saving={savingField !== null}
          inputDir="rtl"
          placeholder={language.command('בחר מגדר')}
        >
          <Select value={gender || undefined} onValueChange={setGender}>
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
            <span className="shrink-0 text-base font-semibold text-muted-foreground">מספר רישיון תיווך:</span>
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
            <span className="shrink-0 text-base font-semibold text-muted-foreground">מספר רישיון תיווך:</span>
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
        {showBrokerFields && isOwnProfile && !verifiedLicenseLocked && brokerLicense !== storedLicense && <Button type="button" variant="outline" size="icon" aria-label="שמירת רישיון תיווך" disabled={savingField !== null || verifiedBrokerLicense !== brokerLicense} onClick={() => void saveField('brokerLicense', brokerLicense)}><Check className="h-4 w-4" /></Button>}

        {profileOwnerId && <UpgradeToBrokerButton profileOwnerId={profileOwnerId} />}
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <Button type="button" onClick={handleSignOut} variant="outline" size="lg" className="w-full gap-2 text-base border-destructive/30 text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" />יציאה
          </Button>
          {user && <DeleteAccountButton showLabel />}
        </div>
      </div>

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


    </div>
  );
}

function WorkspaceTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { refresh: refreshBrand } = useWhiteLabel();
  const ownerId = activeWorkspaceId;
  const [agencyName, setAgencyName] = useState('');
  const [savedAgencyName, setSavedAgencyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [officeDetails, setOfficeDetails] = useState({ office_address: '', public_email: '', brokerage_name: '', brokerage_license: '' });
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingLogo, setPendingLogo] = useState<{ file: File; ownerId: string } | null>(null);
  const alive = useRef(true);
  const saveLock = useRef(false);
  const isMasterOffice = ownerId === RITA_WORKSPACE_OWNER_ID;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    setLoading(true);
    setPendingLogo(null);
    (async () => {
      try {
        const { data, error } = await supabase.from('white_label_settings')
          .select('agency_name, logo_url, office_address, public_email, brokerage_name, brokerage_license')
          .eq('user_id', ownerId).maybeSingle();
        if (error) throw error;
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select('city, service_areas').eq('id', ownerId).maybeSingle();
        if (profileError) throw profileError;
        if (cancelled) return;
        const name = data?.agency_name || '';
        setAgencyName(name); setSavedAgencyName(name);
        setLogoUrl(data?.logo_url || activeWorkspace?.workspace_logo_url || '');
        setOfficeDetails({ office_address: data?.office_address || '', public_email: data?.public_email || '', brokerage_name: data?.brokerage_name || '', brokerage_license: data?.brokerage_license || '' });
        setServiceAreas(normalizeCitySelection(profile?.service_areas?.length ? profile.service_areas : [profile?.city || '']));
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'טעינת פרטי המשרד נכשלה');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  const notifySaved = async () => {
    await refreshBrand();
    if (!alive.current) return;
    window.dispatchEvent(new Event('realtyz:profile-saved'));
    void queryClient.invalidateQueries({ queryKey: ['service_areas', ownerId] });
  };

  const saveOfficeField = async (field: OfficeField, value: string): Promise<boolean> => {
    if (!ownerId || loading || saveLock.current) return false;
    saveLock.current = true;
    setSavingField(field);
    try {
      const { data, error } = await supabase.from('white_label_settings')
        .upsert(workspaceDetailPatch(ownerId, field, value), { onConflict: 'user_id' })
        .select('user_id').single();
      if (error) throw error;
      if (data?.user_id !== ownerId) throw new Error('השדה לא נשמר');
      if (!alive.current) return false;
      if (field === 'agency_name') {
        setSavedAgencyName(value.trim()); setAgencyName(value.trim());
        if (user?.id === ownerId) {
          const { error: metadataError } = await supabase.auth.updateUser({ data: { agency_name: value.trim() } });
          if (metadataError) throw metadataError;
        }
      }
      if (field === 'logo_url') setLogoUrl(value);
      await notifySaved();
      return true;
    } catch (error: any) {
      if (alive.current) toast.error(error?.message || 'שמירת השדה נכשלה');
      return false;
    } finally { saveLock.current = false; if (alive.current) setSavingField(null); }
  };

  const saveServiceAreas = async (values: string[]) => {
    if (!ownerId || loading || saveLock.current) return;
    const next = normalizeCitySelection(values);
    saveLock.current = true;
    setSavingField('service_areas');
    try {
      const { data, error } = await supabase.from('profiles').update({ service_areas: next })
        .eq('id', ownerId).select('id, service_areas').single();
      if (error) throw error;
      if (data?.id !== ownerId) throw new Error('אזורי השירות לא נשמרו');
      if (!alive.current) return;
      setServiceAreas(normalizeCitySelection(data.service_areas || []));
      if (user?.id === ownerId) {
        const { error: metadataError } = await supabase.auth.updateUser({ data: { service_areas: next } });
        if (metadataError) throw metadataError;
      }
      await notifySaved();
    } catch (error: any) {
      if (alive.current) toast.error(error?.message || 'שמירת אזורי השירות נכשלה');
    } finally { saveLock.current = false; if (alive.current) setSavingField(null); }
  };

  const onLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !ownerId) return;
    if (!file.type.startsWith('image/')) { toast.error('יש לבחור קובץ תמונה'); return; }
    if (!file.size || file.size > 5 * 1024 * 1024) { toast.error('יש לבחור תמונה בגודל עד 5MB'); return; }
    setPendingLogo({ file, ownerId });
  };

  const uploadCroppedLogo = async (file: File) => {
    if (!pendingLogo || !ownerId || pendingLogo.ownerId !== ownerId) return;
    setUploading(true);
    try {
      const path = `${ownerId}/square-logo-${Date.now()}.png`;
      const { error } = await supabase.storage.from('agency-logos').upload(path, file, { contentType: file.type || undefined, cacheControl: '3600' });
      if (error) throw error;
      if (!alive.current) return;
      const { data } = supabase.storage.from('agency-logos').getPublicUrl(path);
      if (!data.publicUrl.startsWith('http')) throw new Error('לא התקבלה כתובת לתמונה');
      if (await saveOfficeField('logo_url', data.publicUrl)) {
        if (!alive.current) return;
        setPendingLogo(null);
        toast.success('הלוגו נשמר');
      }
    } catch (error: any) { if (alive.current) toast.error(error?.message || 'העלאת הלוגו נכשלה'); }
    finally { if (alive.current) setUploading(false); }
  };

  const busy = loading || uploading || savingField !== null;
  return (
    <div className="w-full min-w-0 space-y-4 pb-4">
      {pendingLogo && pendingLogo.ownerId === ownerId && <ImageCropDialog file={pendingLogo.file} aspect={1} title="חיתוך לוגו" onCancel={() => setPendingLogo(null)} onConfirm={uploadCroppedLogo} />}
      <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 text-right sm:grid-cols-[128px_minmax(0,1fr)] sm:gap-5">
        <LogoBox title="לוגו" url={logoUrl} disabled={busy} aspect="square" onUpload={onLogoUpload} onRemove={() => void saveOfficeField('logo_url', '')} />
        <div className="min-w-0 space-y-3">
          <div className="relative">
            <Input dir="rtl" aria-label="שם תצוגה" placeholder="שם תצוגה" value={agencyName} disabled={busy} onChange={event => setAgencyName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && agencyName !== savedAgencyName) void saveOfficeField('agency_name', agencyName); }} className="h-10 pe-10 text-right text-base font-bold" />
            {agencyName !== savedAgencyName && <Button type="button" variant="ghost" size="icon" aria-label="שמירת שם תצוגה" disabled={busy} onClick={() => void saveOfficeField('agency_name', agencyName)} className="absolute inset-y-0 left-0 h-10 w-10"><Check className="h-4 w-4" /></Button>}
          </div>
          <IsraeliCityPicker value="" onChange={() => {}} selectedValues={serviceAreas} onSelectionChange={values => void saveServiceAreas(values)} firstOptions={['כל הארץ']} placeholder="אזורי שירות" disabled={busy} className="h-10 text-base" itemClassName="text-base" />
        </div>
      </div>
      {isMasterOffice && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([['office_address', 'כתובת המשרד'], ['public_email', 'דוא״ל ציבורי'], ['brokerage_name', 'שם המתווך האחראי'], ['brokerage_license', 'רישיון תיווך']] as const).map(([key, label]) => <div key={key} className="space-y-1.5">
          <label htmlFor={`office-${key}`} className="text-base text-muted-foreground">{label}</label>
          <div className="relative">
            <Input id={`office-${key}`} type={key === 'public_email' ? 'email' : 'text'} dir={key === 'public_email' || key === 'brokerage_license' ? 'ltr' : 'rtl'} value={officeDetails[key]} disabled={busy} className="pl-10" onChange={event => setOfficeDetails(previous => ({ ...previous, [key]: event.target.value }))} />
            <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 left-0 h-10 w-10" aria-label={`שמירת ${label}`} disabled={busy} onClick={() => void saveOfficeField(key, officeDetails[key])}><Check className="h-4 w-4" /></Button>
          </div>
        </div>)}
      </div>}
    </div>
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
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="h-6 w-6 text-destructive hover:bg-destructive/10" aria-label={`מחק ${title}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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

      <Tabs value={tab} onValueChange={handleTabChange} dir="rtl">
        <div className="sticky top-0 z-30 -mx-2 mb-[15px] h-16 bg-background px-2 py-2 before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-background sm:-mx-4 sm:px-4">
        <TabsList className={`grid h-12 w-full ${isAgency ? 'grid-cols-5' : 'grid-cols-4'} bg-muted`}>
          <TabsTrigger className="text-base" value="personal">פרופיל</TabsTrigger>
          <TabsTrigger className="text-base" value="workspace">{officeLabel}</TabsTrigger>
          <TabsTrigger className="text-base" value="aibrain">מח AI</TabsTrigger>
          <TabsTrigger className="text-base" value="connections">חיבורים</TabsTrigger>
          {isAgency && <TabsTrigger className="text-base" value="managers">מנהלים</TabsTrigger>}
        </TabsList>
        </div>
        <TabsContent value="personal" className="mt-[20px] space-y-4">
          {activeWorkspaceId && <PersonalTab key={`${user?.id}:${activeWorkspaceId}`} />}
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
          {activeWorkspaceId && <WorkspaceTab key={`${user?.id}:${activeWorkspaceId}`} />}
        </TabsContent>
        <TabsContent value="connections" className="mt-[20px] space-y-4" dir="rtl">
          <ConnectionsTab key={activeWorkspaceId ?? user?.id ?? 'connections'} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
