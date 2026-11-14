export const WALLET_PACKAGE_MIN = 5;
export const WALLET_PACKAGE_MAX = 2500;
export const WALLET_BONUS_TIERS = [
  { amount: 5, percent: 0 }, { amount: 50, percent: 5 },
  { amount: 200, percent: 10 }, { amount: 500, percent: 15 },
  { amount: 1000, percent: 20 }, { amount: 2500, percent: 25 },
] as const;
export const validWalletPackage = (amount: number) => Number.isFinite(amount) && amount >= WALLET_PACKAGE_MIN && amount <= WALLET_PACKAGE_MAX && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
export function walletPackage(amount: number, rate: number) {
  const percent = [...WALLET_BONUS_TIERS].reverse().find(tier => amount >= tier.amount)?.percent ?? 0;
  const bonusIls = Math.round(amount * percent) / 100;
  return { percent, bonusIls, credits: Math.round((amount + bonusIls) * rate * 100) / 100 };
}