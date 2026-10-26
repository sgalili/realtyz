import { partnerNetReward } from './affiliatePlans';

type Types = { form?: boolean; whatsapp?: boolean; phone?: boolean; closing?: boolean };
type Amounts = { tier1?: number; tier2?: number; tier3?: number; tier4?: number };
/** Guests see the trophy but never amounts; closing prices require server authorization. */
export function tableRoyalties(types: Types, amounts: Amounts, signedIn: boolean, closingAllowed: boolean, showAll = !signedIn || closingAllowed) {
  const broker = signedIn && closingAllowed;
  const visible = { form: true, whatsapp: true, phone: true, closing: true };
  return { types: visible, prices: signedIn ? {
    form: amounts.tier1 == null ? undefined : partnerNetReward(amounts.tier1), whatsapp: amounts.tier2 == null ? undefined : partnerNetReward(amounts.tier2),
    phone: amounts.tier3 == null ? undefined : partnerNetReward(amounts.tier3), closing: broker && amounts.tier4 != null && amounts.tier4 > 0 ? partnerNetReward(amounts.tier4) : undefined,
  } : undefined };
}
