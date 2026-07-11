import { useRef, useState } from 'react';
import { Upload, RefreshCw, Loader2 } from 'lucide-react';
import VoterAvatar from '@/components/VoterAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { BrandIcon } from '@/components/BrandIcon';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type SocialChannel = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok' | 'youtube';

interface Props {
  leadId: string;
  fullName: string | null;
  profilePictureUrl: string | null;
  phone: string | null;
  handles: {
    instagram?: string | null;
    facebook?: string | null;
    messenger?: string | null;
    x?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
    linkedin?: string | null;
  };
  onUpdated?: () => void;
}

// Per-channel brand color for the dropdown badge, so each channel is
// instantly recognizable and matches the network's official identity.
const BRAND: Record<SocialChannel | 'whatsapp', { bg: string; label: string }> = {
  whatsapp:  { bg: '#25D366', label: 'וואטסאפ' },
  facebook:  { bg: '#1877F2', label: 'פייסבוק' },
  instagram: { bg: '#E4405F', label: 'אינסטגרם' },
  linkedin:  { bg: '#0A66C2', label: 'לינקדאין' },
  x:         { bg: '#111111', label: 'X' },
  tiktok:    { bg: '#010101', label: 'טיקטוק' },
  youtube:   { bg: '#FF0000', label: 'יוטיוב' },
};

const brandPill = (name: keyof typeof BRAND) => (
  <span
    className="ms-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-white shrink-0 shadow-sm"
    style={{ backgroundColor: BRAND[name].bg }}
  >
    <BrandIcon name={name === 'x' ? 'x' : name} className="h-5 w-5 max-h-5 max-w-5" />
  </span>
);

export default function LeadProfilePictureMenu({ leadId, fullName, profilePictureUrl, phone, handles, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | string>(null);

  const parseMaybeJson = (value: any) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  };

  const readFunctionError = async (err: any) => {
    const ctx = err?.context;
    if (!ctx) return null;
    try {
      const text = typeof ctx.text === 'function' ? await ctx.text() : null;
      return parseMaybeJson(text);
    } catch {
      return null;
    }
  };

  const extractReason = (err: any, data: any) => {
    const d = parseMaybeJson(data);
    const firstError = Array.isArray(d?.errors) ? d.errors.find(Boolean) : null;
    const firstReason = Array.isArray(d?.reasons) ? d.reasons.find(Boolean) : null;
    const resultReason = Array.isArray(d?.results)
      ? d.results.map((r: any) => r?.reason || r?.error || r?.details).find(Boolean)
      : null;
    const attemptReason = Array.isArray(d?.attempts)
      ? d.attempts.map((a: any) => [a?.provider, a?.status ? `HTTP ${a.status}` : null, a?.message].filter(Boolean).join(' — ')).find(Boolean)
      : null;
    const reason =
      d?.reason ||
      d?.message ||
      d?.error ||
      d?.details ||
      firstReason ||
      firstError ||
      resultReason ||
      attemptReason ||
      err?.message ||
      'הפלטפורמה חוסמת שליפה אוטומטית או שאין נתונים זמינים';
    return typeof reason === 'string' ? reason : JSON.stringify(reason);
  };

  const explainError = (label: string, err: any, data: any, toastId?: string | number) => {
    if (toastId) toast.dismiss(toastId);
    toast.error(`שליפה מ-${label} לא הצליחה`, {
      description: extractReason(err, data),
      duration: 9000,
    });
  };

  const uploadFile = async (file: File) => {
    setBusy('upload');
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `leads/${leadId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('agency-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('agency-logos').getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const { error } = await supabase.from('leads').update({ profile_picture_url: publicUrl }).eq('id', leadId);
      if (error) throw error;
      toast.success('תמונת הפרופיל עודכנה');
      onUpdated?.();
    } catch (e: any) {
      toast.error('העלאת התמונה נכשלה', { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const fetchFromWA = async () => {
    if (!phone) { toast.error('אין מספר טלפון', { description: 'הוסף מספר טלפון לפני משיכה מוואטסאפ' }); return; }
    setBusy('whatsapp');
    const toastId = toast.loading('מושך תמונה מוואטסאפ...');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', { body: { lead_ids: [leadId], force: true } });
      const errorData = error ? await readFunctionError(error) : null;
      if (error) { explainError(BRAND.whatsapp.label, error, errorData || data, toastId); return; }
      const d = (data as any) || {};
      if (d.success === false || d.error) { explainError(BRAND.whatsapp.label, null, d, toastId); return; }
      if ((d.updated ?? 0) > 0) { toast.success('תמונה עודכנה מוואטסאפ', { id: toastId }); onUpdated?.(); return; }
      if ((d.failed ?? 0) > 0 || d.reason || (Array.isArray(d.errors) && d.errors.length)) { explainError(BRAND.whatsapp.label, null, d, toastId); return; }
      // scanned but nothing to update — either no avatar on WA or phone not on WA.
      toast.dismiss(toastId);
      toast.warning('לא נמצאה תמונת פרופיל פעילה בוואטסאפ', {
        description: 'המספר עשוי לא להיות רשום, או שהגדרות הפרטיות ב-WhatsApp מסתירות את התמונה',
        duration: 9000,
      });
    } catch (e: any) {
      explainError(BRAND.whatsapp.label, e, null, toastId);
    } finally {
      setBusy(null);
    }
  };

  const fetchFromChannel = async (channel: SocialChannel, handle: string) => {
    setBusy(channel);
    const toastId = toast.loading(`מושך תמונה מ-${BRAND[channel].label}...`);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-social-avatar', {
        body: { lead_id: leadId, channel, handle },
      });
      const errorData = error ? await readFunctionError(error) : null;
      if (error) { explainError(BRAND[channel].label, error, errorData || data, toastId); return; }
      const d = (data as any) || {};
      if (d.success === false || d.error || !d.url) { explainError(BRAND[channel].label, null, d, toastId); return; }
      toast.success(`תמונה עודכנה מ-${BRAND[channel].label}`, { id: toastId, description: 'תמונת הפרופיל נשמרה בכרטיס ה-CRM' });
      onUpdated?.();
    } catch (e: any) {
      explainError(BRAND[channel].label, e, null, toastId);
    } finally {
      setBusy(null);
    }
  };

  const has = handles;
  const facebookHandle = has.facebook || has.messenger || null;
  const availableChannels: Array<{ key: SocialChannel; handle: string }> = [
    facebookHandle && { key: 'facebook' as const, handle: facebookHandle },
    has.instagram && { key: 'instagram' as const, handle: has.instagram },
    has.linkedin && { key: 'linkedin' as const, handle: has.linkedin },
    has.x && { key: 'x' as const, handle: has.x },
    has.tiktok && { key: 'tiktok' as const, handle: has.tiktok },
    has.youtube && { key: 'youtube' as const, handle: has.youtube },
  ].filter(Boolean) as Array<{ key: SocialChannel; handle: string }>;
  const anySocial = availableChannels.length > 0;
  const loading = busy !== null;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.currentTarget.value = ''; }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={loading}>
          <button
            type="button"
            className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 group"
            aria-label="ערוך תמונת פרופיל"
            title="לחץ לניהול תמונת הפרופיל"
          >
            <VoterAvatar fullName={fullName} profilePictureUrl={profilePictureUrl} className="h-16 w-16 shadow-lg" textClassName="text-xl" />
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </span>
            )}
            {!loading && (
              <span className="absolute inset-0 rounded-full ring-0 group-hover:ring-2 group-hover:ring-primary/60 transition" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 text-right">
          <DropdownMenuLabel>תמונת פרופיל</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={loading} className="gap-1">
            <Upload className="ms-2 h-4 w-4" />
            <span className="font-semibold">העלאת תמונה</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {phone && (
            <DropdownMenuItem
              onClick={fetchFromWA}
              disabled={loading}
              className="gap-1 focus:bg-[#25D366]/10"
            >
              {brandPill('whatsapp')}
              <span className="font-semibold">משיכה מ{BRAND.whatsapp.label}</span>
            </DropdownMenuItem>
          )}
          {availableChannels.map(({ key, handle }) => (
            <DropdownMenuItem
              key={key}
              onClick={() => fetchFromChannel(key, handle)}
              disabled={loading}
              className="gap-1"
            >
              {brandPill(key)}
              <span className="font-semibold">משיכה מ{BRAND[key].label}</span>
            </DropdownMenuItem>
          ))}
          {!anySocial && !phone && (
            <DropdownMenuItem disabled>
              <RefreshCw className="ms-2 h-4 w-4" /> אין ערוצים מקושרים
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
