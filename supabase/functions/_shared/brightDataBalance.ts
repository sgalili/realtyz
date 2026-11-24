/** Billing evidence only: 429, suspension and bad credentials do not prove an empty balance. */
export function brightDataBalanceExhausted(status: number | undefined, message: string) {
  return /bright\s*data|brightdata|x-brd|client_\d+/i.test(message) &&
    (status === 402 || /(?:insufficient|exhausted|depleted|no|zero|out of)\s+(?:account\s+)?(?:credits?|balance|funds)|(?:credits?|balance|funds|quota|spending limit).{0,50}(?:exhausted|depleted|exceeded|reached|empty)|(?:billing|payment).{0,25}(?:required|limit reached)/i.test(message));
}