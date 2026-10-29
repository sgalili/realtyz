/** Outline messaging glyph with the same 24-unit stroke scale as the other pricing icons. */
export function PublisherWhatsAppIcon({ className, strokeWidth }: { className?: string; strokeWidth: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d="M21 11.5a9 9 0 0 1-13.4 7.9L3 21l1.6-4.6A9 9 0 1 1 21 11.5Z" />
    <path d="m8.2 7.4 1.4 2.7-1 1.1a9.1 9.1 0 0 0 4.2 4.2l1.1-1 2.7 1.4c-.5 1.5-1.5 2-2.8 1.6-3.5-1-6.3-3.8-7.3-7.3-.4-1.3.1-2.3 1.7-2.7Z" />
  </svg>;
}