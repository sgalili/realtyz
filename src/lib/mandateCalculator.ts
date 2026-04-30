export const VOTES_PER_MANDATE = 38000;

export interface MandatePlanInput {
  mandates: number;
  hotConversionRate: number;
  coldConversionRate: number;
  hotShare?: number;
}

export function calculateMandatePlan({
  mandates,
  hotConversionRate,
  coldConversionRate,
  hotShare = 0.6,
}: MandatePlanInput) {
  const targetVotes = Math.max(0, mandates) * VOTES_PER_MANDATE;
  const safeHotRate = Math.max(1, hotConversionRate) / 100;
  const safeColdRate = Math.max(1, coldConversionRate) / 100;
  const hotVotesTarget = Math.round(targetVotes * hotShare);
  const coldVotesTarget = targetVotes - hotVotesTarget;
  const hotContactsRequired = Math.ceil(hotVotesTarget / safeHotRate);
  const coldContactsRequired = Math.ceil(coldVotesTarget / safeColdRate);

  return {
    targetVotes,
    hotVotesTarget,
    coldVotesTarget,
    hotContactsRequired,
    coldContactsRequired,
    totalContactsRequired: hotContactsRequired + coldContactsRequired,
  };
}