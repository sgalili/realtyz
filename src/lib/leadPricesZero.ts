type LeadPriceFields = { commissionForm?: unknown; commissionWhatsapp?: unknown; commissionPhone?: unknown };

const amount = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** True when all three lead types (form, WhatsApp/chat, phone) are priced at ₪0. */
export function allLeadPricesZero(f: LeadPriceFields): boolean {
  return [f.commissionForm, f.commissionWhatsapp, f.commissionPhone].every((v) => amount(v) === 0);
}
