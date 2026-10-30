/** A declined prompt advances the same auth/confirmation flow without changing consent. */
export function publisherMarketingDecision(accepted: boolean, reviewed: boolean): 'explain' | 'continue' {
  return accepted || reviewed ? 'continue' : 'explain';
}