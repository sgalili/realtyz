import { cn } from '@/lib/utils';

/**
 * Microsoft Excel brand icon (simplified official logo).
 * Kept as an SVG component so it scales with the surrounding button/icon
 * size and does not rely on arbitrary Tailwind colour utilities.
 */
export function ExcelIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      {/* Page body */}
      <path
        d="M4 3.5C4 2.67 4.67 2 5.5 2H14L20 8V20.5C20 21.33 19.33 22 18.5 22H5.5C4.67 22 4 21.33 4 20.5V3.5Z"
        fill="white"
      />
      {/* Excel green fill */}
      <path
        d="M4 8H20V20.5C20 21.33 19.33 22 18.5 22H5.5C4.67 22 4 21.33 4 20.5V8Z"
        fill="#107C41"
      />
      {/* Folded corner */}
      <path d="M14 2L20 8H14V2Z" fill="#21A366" />
      {/* White X */}
      <path
        d="M12.2 10L10 13.2L7.8 10H6.3L9.1 14L6.3 18H7.8L10 14.8L12.2 18H13.7L10.9 14L13.7 10H12.2Z"
        fill="white"
      />
    </svg>
  );
}
