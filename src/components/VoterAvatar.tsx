import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import voter01 from '@/assets/demo-headshots/voter-01.jpg';
import voter02 from '@/assets/demo-headshots/voter-02.jpg';
import voter03 from '@/assets/demo-headshots/voter-03.jpg';
import voter04 from '@/assets/demo-headshots/voter-04.jpg';
import voter05 from '@/assets/demo-headshots/voter-05.jpg';
import voter06 from '@/assets/demo-headshots/voter-06.jpg';
import voter07 from '@/assets/demo-headshots/voter-07.jpg';
import voter08 from '@/assets/demo-headshots/voter-08.jpg';
import voter09 from '@/assets/demo-headshots/voter-09.jpg';
import voter10 from '@/assets/demo-headshots/voter-10.jpg';
import voter11 from '@/assets/demo-headshots/voter-11.jpg';
import voter12 from '@/assets/demo-headshots/voter-12.jpg';
import voter13 from '@/assets/demo-headshots/voter-13.jpg';
import voter14 from '@/assets/demo-headshots/voter-14.jpg';
import voter15 from '@/assets/demo-headshots/voter-15.jpg';
import voter16 from '@/assets/demo-headshots/voter-16.jpg';
import voter17 from '@/assets/demo-headshots/voter-17.jpg';
import voter18 from '@/assets/demo-headshots/voter-18.jpg';
import voter19 from '@/assets/demo-headshots/voter-19.jpg';
import voter20 from '@/assets/demo-headshots/voter-20.jpg';

const fallbackHeadshots = [
  voter01, voter02, voter03, voter04, voter05, voter06, voter07, voter08, voter09, voter10,
  voter11, voter12, voter13, voter14, voter15, voter16, voter17, voter18, voter19, voter20,
];

function getDemoHeadshot(name: string | null): string {
  const seed = name || 'lead';
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return fallbackHeadshots[hash % fallbackHeadshots.length];
}

interface VoterAvatarProps {
  fullName: string | null;
  profilePictureUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  textClassName?: string;
}

const VoterAvatar = ({
  fullName,
  profilePictureUrl,
  className,
  fallbackClassName,
  textClassName,
}: VoterAvatarProps) => {
  const { isDemoMode } = useDemoMode();
  const [broken, setBroken] = useState(false);

  // Use the real profile picture if WhatsApp/social fetched one.
  // In demo mode, fall back to bundled headshots for richer UX.
  // In a real account, NEVER fabricate a photo - show a clean line-art user icon.
  const realPicture = profilePictureUrl?.trim() || null;
  const imageUrl = realPicture || (isDemoMode ? getDemoHeadshot(fullName) : null);

  useEffect(() => setBroken(false), [imageUrl]);

  const initials = (fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <Avatar className={cn('shrink-0', className)}>
      {imageUrl && !broken ? (
        <img
          src={imageUrl}
          alt={fullName || 'lead'}
          loading="eager"
          decoding="sync"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <AvatarFallback className={cn('bg-primary/10 text-primary font-semibold', fallbackClassName)}>
          {initials ? (
            <span className={cn('leading-none', textClassName)}>{initials}</span>
          ) : (
            <User className={cn('h-1/2 w-1/2', textClassName)} strokeWidth={1.5} />
          )}
        </AvatarFallback>
      )}
    </Avatar>
  );
};


export default VoterAvatar;
