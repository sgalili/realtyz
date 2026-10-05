import type { SVGProps } from 'react';

/** Scheduled delivery, distinct from a generic waiting clock. */
export function SendClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m11 17-2-2-6 2 4-6-4-8 18 6-7 3M3 3l8 8" />
      <circle cx="17" cy="17" r="5" />
      <path d="M17 14v3l2 1" />
    </svg>
  );
}