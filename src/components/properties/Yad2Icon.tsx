/**
 * Yad2 brand mark (orange rounded square + "yad2" wordmark).
 * Used for the direct "open the live ad on Yad2" action button.
 */
export function Yad2Icon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="yad2">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#FF5100" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#FFFFFF"
      >
        yad2
      </text>
    </svg>
  );
}

export default Yad2Icon;
