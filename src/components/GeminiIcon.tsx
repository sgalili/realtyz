/** Official Google Gemini spark mark (gradient), sized by className. */
export function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Gemini">
      <defs>
        <linearGradient id="gemini-spark" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1C7DFF" />
          <stop offset="52%" stopColor="#9A6CFF" />
          <stop offset="100%" stopColor="#E64A9B" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-spark)"
        d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0Z"
      />
    </svg>
  );
}

export default GeminiIcon;
