import { partnerNetReward } from './affiliatePlans';

type Types = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };
type Amounts = { tier1: number; tier2: number; tier3: number; tier4: number };
/** Closing icon and price exist only for signed-in, server-authorized brokers. */
export function tableRoyalties(types: Types, amounts: Amounts, signedIn: boolean, closingAllowed: boolean) {
  const broker = signedIn && closingAllowed;
  const visible = { ...types, closing: broker && amounts.tier4 > 0 };
  return { types: visible, prices: signedIn ? {
    form: partnerNetReward(amounts.tier1), whatsapp: partnerNetReward(amounts.tier2),
    phone: partnerNetReward(amounts.tier3), closing: visible.closing ? partnerNetReward(amounts.tier4) : undefined,
  } : undefined };
}
