import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Identity links never activate the surrounding property row or card. */
export function PublicIdentityLink({ userId, office = false, children, className, label }: { userId?: string | null; office?: boolean; children: ReactNode; className?: string; label?: string }) {
  if (!userId) return <span className={className}>{children}</span>;
  return <Link to={`/community/${office ? 'office' : 'profile'}/${encodeURIComponent(userId)}`} aria-label={label} className={cn('rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{children}</Link>;
}