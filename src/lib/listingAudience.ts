export type RewardPresence = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };

/** Missing/redacted values are unknown, never an explicit zero-reward signal. */
export function visibleToListingAudience(rewards: RewardPresence | null | undefined, signedIn: boolean, verifiedBroker: boolean): boolean {
  if (!signedIn || verifiedBroker) return true;
  return !(rewards?.closing === true && rewards.form === false && rewards.whatsapp === false && rewards.phone === false);
}