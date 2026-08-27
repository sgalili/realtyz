import { BrandLogo } from '@/components/social/BrandLogo';
import { BrandIcon } from '@/components/BrandIcon';

/* Realtyz landing — infinite auto-scrolling logo tickers.
   Social platforms use their official brand colors (BrandLogo).
   Infrastructure row shows the operating tech stack logos + wordmarks. */

const PLATFORMS = [
  'whatsapp', 'instagram', 'facebook', 'messenger', 'telegram',
  'linkedin', 'x', 'tiktok', 'youtube', 'gmail', 'sms', 'google_drive',
];

const STACK: { label: string; color: string; icon?: string }[] = [
  { label: 'Google Cloud', color: '#4285F4', icon: 'googlecloud' },
  { label: 'AWS', color: '#FF9900', icon: 'amazonaws' },
  { label: 'Supabase', color: '#3ECF8E', icon: 'supabase' },
  { label: 'GitHub', color: '#E6EDF3', icon: 'github' },
  { label: 'GreenAPI', color: '#25D366' },
  { label: '019', color: '#E4002B' },
];


export function PlatformTicker() {
  return (
    <div className="landing-ticker" dir="ltr">
      <div className="landing-ticker-track">
        {[0, 1].map((dup) => (
          <div key={dup} className="landing-ticker-group" aria-hidden={dup === 1}>
            {PLATFORMS.map((p) => (
              <BrandLogo key={`${dup}-${p}`} platform={p} size={38} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StackTicker() {
  return (
    <div className="landing-ticker" dir="ltr">
      <div className="landing-ticker-track landing-ticker-slow">
        {[0, 1].map((dup) => (
          <div key={dup} className="landing-ticker-group" aria-hidden={dup === 1}>
            {STACK.map((s) => (
              <span
                key={`${dup}-${s.label}`}
                className="whitespace-nowrap text-lg font-extrabold tracking-tight"
                style={{ color: s.color }}
              >
                {s.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
