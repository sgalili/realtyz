import { BrandLogo } from '@/components/social/BrandLogo';
import { BrandIcon } from '@/components/BrandIcon';
import greenApiLogo from '@/assets/brands/green-api.svg';
import logo019 from '@/assets/brands/019-mobile.png';

/* Realtyz landing — infinite auto-scrolling logo tickers.
   Social platforms use their official brand colors (BrandLogo).
   Infrastructure row shows the operating tech stack logos + wordmarks. */

const PLATFORMS = [
  'whatsapp', 'instagram', 'facebook', 'messenger', 'telegram',
  'linkedin', 'x', 'tiktok', 'youtube', 'gmail', 'sms', 'google_drive',
];

const STACK: { label: string; color: string; icon?: string; img?: string; chip?: boolean; hideLabel?: boolean }[] = [
  { label: 'OpenAI', color: '#FFFFFF', icon: 'openai' },
  { label: 'Gemini', color: '#9B72CB', icon: 'gemini' },
  { label: 'Claude Code', color: '#D97757', icon: 'claude' },
  { label: 'React', color: '#61DAFB', icon: 'react' },
  { label: 'Meta', color: '#0866FF', icon: 'meta' },
  { label: 'WhatsApp Business', color: '#25D366', icon: 'whatsapp' },
  { label: 'Google Cloud', color: '#4285F4', icon: 'googlecloud' },
  { label: 'AWS', color: '#FF9900', icon: 'amazonaws' },
  { label: 'Supabase', color: '#3ECF8E', icon: 'supabase' },
  { label: 'GitHub', color: '#000000', icon: 'github', chip: true },
  { label: 'GreenAPI', color: '#25D366', img: greenApiLogo },
  { label: '019', color: '#E4002B', img: logo019, hideLabel: true },
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
      <div className="landing-ticker-track landing-ticker-slow landing-ticker-reverse">
        {[0, 1].map((dup) => (
          <div key={dup} className="landing-ticker-group" aria-hidden={dup === 1}>
            {STACK.map((s) => (
              <span
                key={`${dup}-${s.label}`}
                className="inline-flex items-center gap-2 whitespace-nowrap text-lg font-extrabold tracking-tight"
                style={{ color: s.color }}
              >
                {s.icon && (
                  s.chip ? (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white">
                      <BrandIcon name={s.icon} className="h-5 w-5" style={{ color: '#000000' }} />
                    </span>
                  ) : (
                    <BrandIcon name={s.icon} className="h-6 w-6 shrink-0" />
                  )
                )}
                {s.img && (
                  <img
                    src={s.img}
                    alt={`${s.label} logo`}
                    loading="eager" decoding="async"
                    className="h-7 w-auto shrink-0 object-contain"
                  />
                )}
                {!s.hideLabel && s.label}

              </span>
            ))}

          </div>
        ))}
      </div>
    </div>
  );
}
