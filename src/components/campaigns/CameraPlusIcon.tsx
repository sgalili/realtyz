import { cn } from '@/lib/utils';

/**
 * Camera outline with a plus inside the body — the "add photos" affordance.
 * The installed icon library has no camera-plus glyph, so the shape is drawn
 * here in the library's own stroke style (24x24 grid, stroke width 2, currentColor).
 */
export function CameraPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <path d="M12 10.8v4.4" />
      <path d="M9.8 13h4.4" />
    </svg>
  );
}
