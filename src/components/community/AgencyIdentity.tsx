import { cn } from '@/lib/utils';

export function AgencyIdentity({ name, logoUrl, className, logoClassName }: {
  name?: string | null;
  logoUrl?: string | null;
  className?: string;
  logoClassName?: string;
}) {
  if (!name && !logoUrl) return null;
  return <span className={cn('flex min-w-0 items-center gap-2', className)}>
    {logoUrl && <img
      src={logoUrl}
      alt={name ? `לוגו ${name}` : 'לוגו המשרד'}
      loading="lazy"
      className={cn('h-7 w-7 shrink-0 rounded-sm bg-background object-contain', logoClassName)}
    />}
    {name && <span className="min-w-0 truncate">{name}</span>}
  </span>;
}
