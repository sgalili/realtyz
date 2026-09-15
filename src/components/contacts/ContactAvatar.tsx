/**
 * ContactAvatar
 * ─────────────
 * One shared avatar for every place a contact is rendered (tasks, tours,
 * incoming leads, reminders, calls). Shows the contact's profile picture when
 * we have one, otherwise their initials.
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function initialsOf(name?: string | null) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0]).join('');
}

export function ContactAvatar({
  name,
  imageUrl,
  className,
}: {
  name?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className ?? 'h-9 w-9'}>
      {imageUrl ? <AvatarImage src={imageUrl} alt={name ?? 'איש קשר'} /> : null}
      <AvatarFallback className="bg-primary/10 text-[12px] font-semibold text-primary">
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export default ContactAvatar;
