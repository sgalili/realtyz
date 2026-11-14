import { expect, it } from 'vitest';
import { validWalletPackage, walletPackage } from '../../supabase/functions/_shared/walletPackage';
it.each([[5,0,20],[50,5,210],[200,10,880],[500,15,2300],[1000,20,4800],[2500,25,12500]])('grants the requested tier at ₪%s with four credits per shekel', (amount,percent,credits) => {
  expect(walletPackage(amount,4)).toEqual({ percent, credits, bonusIls: amount*percent/100 });
});
it('uses reached tiers between thresholds rather than granting the next tier early', () => {
  expect(walletPackage(49.99,4).percent).toBe(0);
  expect(walletPackage(199.99,4).percent).toBe(5);
  expect(walletPackage(2499.99,4).percent).toBe(20);
});
it('restricts custom packages to 5–2500 ILS with at most two decimal places', () => {
  for (const n of [5,200.25,2500]) expect(validWalletPackage(n)).toBe(true);
  for (const n of [4.99,2500.01,NaN,Infinity,5.001]) expect(validWalletPackage(n)).toBe(false);
});