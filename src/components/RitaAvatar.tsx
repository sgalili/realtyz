import ritaAvatar from '@/assets/rita-avatar.jpg';
import { cn } from '@/lib/utils';

type RitaAvatarProps = {
  className?: string;
  imageClassName?: string;
  alt?: string;
};

export function RitaAvatar({ className, imageClassName, alt = 'ריטה' }: RitaAvatarProps) {
  return (
    <span className={cn('inline-flex shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border', className)}>
      <img
        src={ritaAvatar}
        alt={alt}
        width={768}
        height={768}
        className={cn('h-full w-full object-cover', imageClassName)}
      />
    </span>
  );
}
