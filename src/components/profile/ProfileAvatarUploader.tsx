import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/profile/ImageCropDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const ONE_YEAR = 60 * 60 * 24 * 365;

function GenderAvatar({ gender }: { gender: 'male' | 'female' | null }) {
  return (
    <svg viewBox="0 0 96 96" className="!h-full !w-full text-foreground" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {gender === 'female' ? (
        <>
          <path d="M30 54c-4-4-5-10-5-17 0-14 9-23 23-23s23 9 23 23c0 7-1 13-5 17" />
          <path d="M32 34c0 14 5 23 16 23s16-9 16-23c-7 0-13-3-16-8-3 5-9 8-16 8z" />
          <path d="M19 82c2-13 14-20 29-20s27 7 29 20" />
        </>
      ) : (
        <>
          <circle cx="48" cy="36" r="18" />
          <path d="M31 30c5 1 11-1 16-5 5 4 11 6 18 5" />
          <path d="M19 82c2-13 14-21 29-21s27 8 29 21" />
        </>
      )}
    </svg>
  );
}

export function ProfileAvatarUploader({ profileOwnerId, gender = null }: { profileOwnerId: string | null; gender?: 'male' | 'female' | null }) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = ((user?.user_metadata ?? {}) as Record<string, any>);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const isOwnProfile = profileOwnerId === user?.id;
  const [avatarPath, setAvatarPath] = useState<string | null>(isOwnProfile ? meta.avatar_path ?? null : null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => { setPendingFile(null); }, [profileOwnerId]);

  useEffect(() => {
    if (!profileOwnerId) return;
    setAvatarUrl(null);
    setAvatarPath(isOwnProfile ? meta.avatar_path ?? null : null);
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', profileOwnerId)
      .maybeSingle()
      .then(({ data }) => setAvatarUrl((data as any)?.avatar_url ?? null));
  }, [profileOwnerId, isOwnProfile, meta.avatar_path]);

  if (!user) return null;

  const onPick = () => inputRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profileOwnerId) return;
    if (!file.type.startsWith('image/') || file.size === 0) { toast.error('יש לבחור קובץ תמונה תקין'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('הקובץ גדול מדי (מקסימום 5MB)'); return; }
    setPendingFile(file);
  };

  const uploadAvatar = async (file: File) => {
    if (!profileOwnerId) return;
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${profileOwnerId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          upsert: true,
          contentType: file.type || 'application/octet-stream',
        });
      if (upErr) throw upErr;


      const { data: signed, error: signErr } = await supabase.storage
        .from('avatars')
        .createSignedUrl(path, ONE_YEAR);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error('signed url missing');

      // Delete previous file (best-effort)
      if (avatarPath && avatarPath !== path) {
        await supabase.storage.from('avatars').remove([avatarPath]).catch(() => {});
      }

      if (isOwnProfile) {
        const { error: metaErr } = await supabase.auth.updateUser({
          data: { avatar_path: path, avatar_url: signed.signedUrl },
        });
        if (metaErr) throw metaErr;
      }
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ avatar_url: signed.signedUrl } as any)
        .eq('id', profileOwnerId);
      if (profErr) throw profErr;


      setAvatarPath(path);
      setAvatarUrl(signed.signedUrl);
      setPendingFile(null);
      toast.success('תמונת הפרופיל עודכנה');
    } catch (err: any) {
      console.error('[avatar upload]', err);
      toast.error(err?.message || 'העלאת התמונה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      if (avatarPath) {
        await supabase.storage.from('avatars').remove([avatarPath]).catch(() => {});
      }
      if (isOwnProfile) await supabase.auth.updateUser({ data: { avatar_path: null, avatar_url: null } });
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null } as any)
        .eq('id', profileOwnerId);
      if (error) throw error;

      setAvatarPath(null);
      setAvatarUrl(null);
      toast.success('התמונה הוסרה');
    } catch (err: any) {
      toast.error(err?.message || 'הסרת התמונה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-3 text-right">
      {pendingFile && <ImageCropDialog file={pendingFile} aspect={1} title="חיתוך תמונת פרופיל" onCancel={() => setPendingFile(null)} onConfirm={uploadAvatar} />}
      <div className="relative mx-auto h-24 w-24">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onPick}
          disabled={busy}
          aria-label={avatarUrl ? 'החלפת תמונת פרופיל' : 'העלאת תמונת פרופיל'}
          title={avatarUrl ? 'החלפת תמונת פרופיל' : 'העלאת תמונת פרופיל'}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background p-0 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="תמונת פרופיל" className="h-full w-full object-cover" />
          ) : (
            <GenderAvatar gender={gender} />
          )}
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={onPick} disabled={busy} aria-label="העלאת תמונת פרופיל" title="העלאת תמונת פרופיל" className="absolute -bottom-2 -right-3 h-8 w-8 rounded-full bg-background text-primary"><Camera className="h-4 w-4" /></Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          disabled={busy}
        />
        <div>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              disabled={busy}
              aria-label="מחיקת תמונת פרופיל"
              title="מחיקת תמונת פרופיל"
              className="absolute -bottom-2 -left-3 h-8 w-8 rounded-full border bg-background text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileAvatarUploader;
