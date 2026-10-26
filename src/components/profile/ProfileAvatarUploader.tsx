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
    <svg viewBox="0 0 96 96" className="h-full w-full text-muted-foreground/40" fill="currentColor" aria-hidden="true">
      {gender === 'female' ? (
        <>
          <path d="M48 14c-15 0-24 11-24 26 0 12-3 20-8 26 8 3 18 4 32 4s24-1 32-4c-5-6-8-14-8-26 0-15-9-26-24-26z" opacity="0.55" />
          <circle cx="48" cy="40" r="15" />
          <path d="M18 96c2-17 15-28 30-28s28 11 30 28z" />
        </>
      ) : (
        <>
          <circle cx="48" cy="38" r="17" />
          <path d="M31 33c0-12 8-19 17-19s17 7 17 19c-4-5-10-7-17-7s-13 2-17 7z" opacity="0.55" />
          <path d="M14 96c2-18 16-30 34-30s32 12 34 30z" />
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
    <div className="rounded-lg border bg-card/40 p-3 text-right">
      {pendingFile && <ImageCropDialog file={pendingFile} aspect={1} title="חיתוך תמונת פרופיל" onCancel={() => setPendingFile(null)} onConfirm={uploadAvatar} />}
      <div className="flex flex-col items-center gap-2">
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
          <span className="absolute bottom-1.5 right-2 flex h-7 w-7 items-center justify-center rounded-full border bg-background/90 text-primary shadow-sm">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </span>
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">{busy ? 'מעלה תמונה...' : null}</p>
        <div className="flex justify-center">
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={busy}
              className="gap-1.5 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              הסר תמונה
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileAvatarUploader;
