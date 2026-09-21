// "Verified broker" vs "digital marketer" eligibility chip.
//
// Levels 1-3 are lead-generation services every partner can earn. Level 4
// (deal closing) needs a verified broker license.
import { BadgeCheck, Clock, Megaphone, ShieldAlert } from 'lucide-react';
import type { LicenseStatus } from '@/hooks/useAffiliateLicense';

const TONES: Record<LicenseStatus, { label: string; icon: typeof BadgeCheck; className: string }> = {
  verified: {
    label: 'מתווך מאומת · רמות 1-4',
    icon: BadgeCheck,
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  pending: {
    label: 'רישיון בבדיקה · רמות 1-3',
    icon: Clock,
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  rejected: {
    label: 'הרישיון נדחה · רמות 1-3',
    icon: ShieldAlert,
    className: 'bg-rose-50 text-rose-800 ring-rose-200',
  },
  none: {
    label: 'שותף שיווק · רמות 1-3',
    icon: Megaphone,
    className: 'bg-sky-50 text-sky-800 ring-sky-200',
  },
};

export function AffiliateEligibilityBadge({
  status,
  onClick,
}: {
  status: LicenseStatus;
  onClick?: () => void;
}) {
  const tone = TONES[status] ?? TONES.none;
  const Icon = tone.icon;
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {tone.label}
    </>
  );
  const className = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tone.className}`;

  if (!onClick) return <span className={className}>{content}</span>;
  return (
    <button type="button" onClick={onClick} className={`${className} transition hover:opacity-80`}>
      {content}
    </button>
  );
}

export default AffiliateEligibilityBadge;
