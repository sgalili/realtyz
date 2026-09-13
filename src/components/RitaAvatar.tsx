import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ritaAvatar from '@/assets/rita-avatar.jpg';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const RITA_PROFILE_ID = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';

type RitaAvatarProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

export function RitaAvatar({ className, imageClassName, alt = 'ריטה' }: RitaAvatarProps) {
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const { data: profileImage } = useQuery({
    queryKey: ['rita-profile-avatar'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('avatar_url').eq('id', RITA_PROFILE_ID).maybeSingle();
      return (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
    },
  });
  const imageSrc = profileImage && !profileImageFailed ? profileImage : ritaAvatar;

  return (
    <span className={cn('inline-flex shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border', className)}>
      <img
        src={imageSrc}
        alt={alt}
        width={768}
        height={768}
        loading="lazy"
        onError={() => setProfileImageFailed(true)}
        className={cn('h-full w-full object-cover', imageClassName)}
      />
    </span>
  );
}
