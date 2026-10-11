import { PartnerProgramIntro } from './PartnerProgramIntro';
export function PartnerOnboarding(props: { onComplete: () => void; onCancel?: () => void }) {
  return <PartnerProgramIntro {...props} />;
}