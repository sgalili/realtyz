/**
 * Official-style marks for the real-estate portals (Yad2 / Homely).
 * Rendered in brand colors when connected and grayscale when not, matching the
 * Google service glyphs in the connections tab.
 */
export function PortalBrandGlyph({
  portal,
  connected = false,
  className,
}: {
  portal: 'yad2' | 'homely';
  connected?: boolean;
  className?: string;
}) {
  const state = connected ? '' : 'grayscale opacity-40';
  const base = `h-5 w-5 shrink-0 rounded-[5px] ${state} ${className ?? ''}`;

  if (portal === 'yad2') {
    return (
      <span
        aria-label="יד2"
        className={`${base} inline-flex items-center justify-center text-[9px] font-black leading-none`}
        style={{ backgroundColor: '#FF6A00', color: '#fff' }}
        dir="rtl"
      >
        יד2
      </span>
    );
  }

  return (
    <span
      aria-label="Homely"
      className={`${base} inline-flex items-center justify-center`}
      style={{ backgroundColor: '#0B62F5', color: '#fff' }}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
        <path fill="currentColor" d="M12 3.2 3.6 10v10.4h5.6v-5.6h5.6v5.6h5.6V10z" />
      </svg>
    </span>
  );
}

export default PortalBrandGlyph;
