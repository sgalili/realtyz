import { useRef, useState } from 'react';
import { Upload, RefreshCw, Loader2 } from 'lucide-react';
import VoterAvatar from '@/components/VoterAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { BrandIcon } from '@/components/BrandIcon';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  };
  onUpdated?: () => void;
}

export default function LeadProfilePictureMenu({ leadId, fullName, profilePictureUrl, phone, handles, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | string>(null); // channel key or 'upload'

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
    if (!phone) { toast.error('אין מספר טלפון'); return; }
    setBusy('whatsapp');
    toast.info('מושך תמונה מוואטסאפ...');
    const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', { body: { lead_ids: [leadId], force: true } });
    setBusy(null);
    if (error) toast.error('שליפה מוואטסאפ נכשלה');
    else if ((data as any)?.updated) { toast.success('תמונה עודכנה מוואטסאפ'); onUpdated?.(); }
    else toast.warning('לא נמצאה תמונה פעילה');
  };

  const fetchFromChannel = async (channel: 'facebook' | 'instagram' | 'x' | 'tiktok' | 'youtube', handle: string) => {
    setBusy(channel);
    toast.info(`מושך תמונה מ-${channel}...`);
    const { data, error } = await supabase.functions.invoke('fetch-social-avatar', {
      body: { lead_id: leadId, channel, handle },
    });
    setBusy(null);
    if (error || (data as any)?.success === false) {
      toast.warning(`שליפה מ-${channel} לא הצליחה`, { description: (data as any)?.reason ?? 'הפלטפורמה חוסמת שליפה אוטומטית' });
    } else {
      toast.success('תמונה עודכנה');
      onUpdated?.();
    }
  };

  const has = handles;
  const anySocial = !!(has.facebook || has.messenger || has.instagram || has.x || has.tiktok || has.youtube);
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
        <DropdownMenuContent align="start" className="w-60 text-right">
          <DropdownMenuLabel>תמונת פרופיל</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={loading}>
            <Upload className="ms-2 h-4 w-4" /> העלאת תמונה
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {phone && (
            <DropdownMenuItem
              onClick={fetchFromWA}
              disabled={loading}
              className="focus:bg-[#25D366]/10 focus:text-[#075E54]"
            >
              <span className="ms-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-white">
                <BrandIcon name="whatsapp" className="h-3.5 w-3.5" />
              </span>
              <span className="font-semibold">משיכה מוואטסאפ</span>
            </DropdownMenuItem>
          )}
          {(has.facebook || has.messenger) && (
            <DropdownMenuItem onClick={() => fetchFromChannel('facebook', (has.facebook || has.messenger)!)} disabled={loading}>
              <BrandIcon name="facebook" className="ms-2 h-4 w-4" /> משיכה מפייסבוק
            </DropdownMenuItem>
          )}
          {has.instagram && (
            <DropdownMenuItem onClick={() => fetchFromChannel('instagram', has.instagram!)} disabled={loading}>
              <BrandIcon name="instagram" className="ms-2 h-4 w-4" /> משיכה מאינסטגרם
            </DropdownMenuItem>
          )}
          {has.x && (
            <DropdownMenuItem onClick={() => fetchFromChannel('x', has.x!)} disabled={loading}>
              <BrandIcon name="x" className="ms-2 h-4 w-4" /> משיכה מ-X
            </DropdownMenuItem>
          )}
          {has.tiktok && (
            <DropdownMenuItem onClick={() => fetchFromChannel('tiktok', has.tiktok!)} disabled={loading}>
              <BrandIcon name="tiktok" className="ms-2 h-4 w-4" /> משיכה מטיקטוק
            </DropdownMenuItem>
          )}
          {has.youtube && (
            <DropdownMenuItem onClick={() => fetchFromChannel('youtube', has.youtube!)} disabled={loading}>
              <BrandIcon name="youtube" className="ms-2 h-4 w-4" /> משיכה מיוטיוב
            </DropdownMenuItem>
          )}
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
