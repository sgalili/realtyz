import { partnerNetReward } from './affiliatePlans';

type Types = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };
type Amounts = { tier1: number; tier2: number; tier3: number; tier4: number };
/** Guests see the trophy but never amounts; closing prices require server authorization. */
export function tableRoyalties(types: Types, amounts: Amounts, signedIn: boolean, closingAllowed: boolean, showAll = !signedIn || closingAllowed) {
  const broker = signedIn && closingAllowed;
  const visible = showAll ? { form: true, whatsapp: true, phone: true, closing: true } : { ...types, closing: true };
  return { types: visible, prices: signedIn ? {
    form: partnerNetReward(amounts.tier1), whatsapp: partnerNetReward(amounts.tier2),
    phone: partnerNetReward(amounts.tier3), closing: broker && amounts.tier4 > 0 ? partnerNetReward(amounts.tier4) : undefined,
  } : undefined };
}
