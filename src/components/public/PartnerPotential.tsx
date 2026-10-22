import { Users } from 'lucide-react';
import { partnerPotential } from '@/lib/partnerPotential';

export function PartnerPotential({ progress }: { progress: number }) {
  const { count, icons } = partnerPotential(progress);
  return <span className="flex min-w-0 flex-col items-center gap-1 closing-tone" dir="rtl" aria-label={`אומדן פוטנציאל: ${count} שותפים`}>
    <span className="flex h-4 items-center justify-center" aria-hidden="true">{Array.from({ length: icons }, (_, index) => <Users key={index} className="h-3.5 w-3.5 transition-opacity motion-reduce:transition-none" />)}</span>
    <span className="text-[10px] font-semibold">כ־{count} שותפים פוטנציאליים</span>
  </span>;
}