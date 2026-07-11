import { useRef } from 'react';
import { Camera, Upload, RefreshCw } from 'lucide-react';
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

  const uploadFile = async (file: File) => {
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
    }
  };

  const fetchFromWA = async () => {
    if (!phone) { toast.error('אין מספר טלפון'); return; }
    toast.info('מושך תמונה מוואטסאפ...');
    const { error } = await supabase.functions.invoke('fetch-wa-avatars', { body: { lead_ids: [leadId] } });
    if (error) toast.error('שליפה מוואטסאפ נכשלה');
    else { toast.success('הבקשה נשלחה'); onUpdated?.(); }
  };

  const fetchFromChannel = async (channel: 'facebook' | 'instagram' | 'x' | 'tiktok' | 'youtube', handle: string) => {
    toast.info(`מושך תמונה מ-${channel}...`);
    const { error } = await supabase.functions.invoke('fetch-social-avatar', {
      body: { lead_id: leadId, channel, handle },
    });
    if (error) toast.error(`שליפה מ-${channel} נכשלה`, { description: 'הפונקציה אינה זמינה עדיין' });
    else { toast.success('הבקשה נשלחה'); onUpdated?.(); }
  };

  const has = handles;
  const anySocial = !!(has.facebook || has.messenger || has.instagram || has.x || has.tiktok || has.youtube);

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
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 group"
            aria-label="ערוך תמונת פרופיל"
            title="ערוך תמונת פרופיל"
          >
            <VoterAvatar fullName={fullName} profilePictureUrl={profilePictureUrl} className="h-16 w-16 shadow-lg" textClassName="text-xl" />
            <span className="absolute bottom-0 end-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-background">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 text-right" dir="rtl">
          <DropdownMenuLabel>תמונת פרופיל</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="ms-2 h-4 w-4" /> העלאת תמונה
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {phone && (
            <DropdownMenuItem onClick={fetchFromWA}>
              <BrandIcon name="whatsapp" className="ms-2 h-4 w-4" /> משיכה מוואטסאפ
            </DropdownMenuItem>
          )}
          {(has.facebook || has.messenger) && (
            <DropdownMenuItem onClick={() => fetchFromChannel('facebook', (has.facebook || has.messenger)!)}>
              <BrandIcon name="facebook" className="ms-2 h-4 w-4" /> משיכה מפייסבוק
            </DropdownMenuItem>
          )}
          {has.instagram && (
            <DropdownMenuItem onClick={() => fetchFromChannel('instagram', has.instagram!)}>
              <BrandIcon name="instagram" className="ms-2 h-4 w-4" /> משיכה מאינסטגרם
            </DropdownMenuItem>
          )}
          {has.x && (
            <DropdownMenuItem onClick={() => fetchFromChannel('x', has.x!)}>
              <BrandIcon name="x" className="ms-2 h-4 w-4" /> משיכה מ-X
            </DropdownMenuItem>
          )}
          {has.tiktok && (
            <DropdownMenuItem onClick={() => fetchFromChannel('tiktok', has.tiktok!)}>
              <BrandIcon name="tiktok" className="ms-2 h-4 w-4" /> משיכה מטיקטוק
            </DropdownMenuItem>
          )}
          {has.youtube && (
            <DropdownMenuItem onClick={() => fetchFromChannel('youtube', has.youtube!)}>
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
