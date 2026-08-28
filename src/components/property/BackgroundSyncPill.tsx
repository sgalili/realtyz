import { Loader2 } from 'lucide-react';

/**
 * Subtle, non-blocking background-sync indicator.
 *
 * Sits in the corner of the property page while data is still being pulled
 * from the source ad. It never claims a percentage (no more false "100%") and
 * never covers or blocks the page — the content stays fully interactive.
 */
export function BackgroundSyncPill({ label = 'מסתנכרן עם המודעה המקורית…' }: { label?: string }) {
  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-md ring-1 ring-border backdrop-blur"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  );
}
