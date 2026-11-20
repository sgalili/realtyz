import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Fixed-square developer identity: a saved company logo always wins over initials or a generic avatar. */
export function DeveloperLogo({ name, logoUrl, className }: { name?: string | null; logoUrl?: string | null; className?: string }) {
  return <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background', className)}>
    {logoUrl ? <img src={logoUrl} alt={name ? `לוגו ${name}` : 'לוגו היזם'} className="h-full w-full object-contain" /> : <Building2 className="h-1/2 w-1/2 text-muted-foreground" aria-hidden="true" />}
  </span>;
}
