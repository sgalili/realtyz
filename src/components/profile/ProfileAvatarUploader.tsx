import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Trash2, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const ONE_YEAR = 60 * 60 * 24 * 365;

export function ProfileAvatarUploader() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = ((user?.user_metadata ?? {}) as Record<string, any>);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(meta.avatar_path ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setAvatarUrl(null);
    setAvatarPath(meta.avatar_path ?? null);
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setAvatarUrl((data as any)?.avatar_url ?? null));
  }, [user?.id, meta.avatar_path]);

  if (!user) return null;

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
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

      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_path: path, avatar_url: signed.signedUrl },
      });
      if (metaErr) throw metaErr;

      await supabase
        .from('profiles')
        .update({ avatar_url: signed.signedUrl })
        .eq('id', user.id)
        .then(() => undefined, () => undefined);

      setAvatarPath(path);
      setAvatarUrl(signed.signedUrl);
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
      await supabase.auth.updateUser({ data: { avatar_path: null, avatar_url: null } });
      await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)
        .then(() => undefined, () => undefined);
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
      <Label className="mb-2 block text-sm font-semibold">{'\n'}</Label>
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          aria-label={avatarUrl ? 'החלפת תמונת פרופיל' : 'העלאת תמונת פרופיל'}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="תמונת פרופיל" className="h-full w-full object-cover" />
          ) : (
            <UserIcon className="h-8 w-8 text-muted-foreground/50" />
          )}
          <span className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center bg-foreground/70 text-background opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">{busy ? 'מעלה תמונה...' : '\n'}</p>
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
