import type { SVGProps } from 'react';

/** Pending/scheduled: hourglass with sand falling in a loop. */
export function SendClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 2h14M5 22h14" />
      <path d="M7 2v3.5a5 5 0 0 0 2.2 4.1L12 12l2.8-2.4A5 5 0 0 0 17 5.5V2" />
      <path d="M7 22v-3.5a5 5 0 0 1 2.2-4.1L12 12l2.8 2.4a5 5 0 0 1 2.2 4.1V22" />
      <path d="M9 6h6l-3 3z" fill="currentColor" stroke="none">
        <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
      </path>
      <line x1="12" y1="12" x2="12" y2="19" strokeWidth="1.2" strokeDasharray="1 2">
        <animate attributeName="stroke-dashoffset" from="0" to="-6" dur="0.6s" repeatCount="indefinite" />
      </line>
      <path d="M9 20h6l-3-2.5z" fill="currentColor" stroke="none">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}
