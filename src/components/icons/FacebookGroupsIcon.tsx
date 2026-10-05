import { cn } from '@/lib/utils';

/** Facebook Groups glyph: blue circle with three people, matching Facebook's Groups icon. */
export function FacebookGroupsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('shrink-0', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <g fill="#FFFFFF">
        <circle cx="12" cy="8.6" r="2.6" />
        <path d="M7.4 16.8c0-2.5 2.06-4.2 4.6-4.2s4.6 1.7 4.6 4.2v.5H7.4z" />
        <circle cx="6.6" cy="10" r="1.8" />
        <path d="M3.6 16.4c0-1.8 1.3-3 3-3 .6 0 1.1.1 1.5.4-.9.8-1.4 1.9-1.5 3.1H3.6z" />
        <circle cx="17.4" cy="10" r="1.8" />
        <path d="M20.4 16.4c0-1.8-1.3-3-3-3-.6 0-1.1.1-1.5.4.9.8 1.4 1.9 1.5 3.1h3z" />
      </g>
    </svg>
  );
}
