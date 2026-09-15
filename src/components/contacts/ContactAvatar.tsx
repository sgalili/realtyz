/**
 * ContactAvatar
 * ─────────────
 * One shared avatar for every place a contact is rendered (tasks, tours,
 * incoming leads, reminders, calls). STRICT RULE: it renders ONLY when the CRM
 * has a real profile picture URL for that contact — never a placeholder, icon
 * or initials fallback.
 */
import { Avatar, AvatarImage } from '@/components/ui/avatar';

export function ContactAvatar({
  name,
  imageUrl,
  className,
}: {
  name?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  if (!imageUrl) return null;
  return (
    <Avatar className={className ?? 'h-9 w-9'}>
      <AvatarImage src={imageUrl} alt={name ?? 'איש קשר'} />
    </Avatar>
  );
}

export default ContactAvatar;
