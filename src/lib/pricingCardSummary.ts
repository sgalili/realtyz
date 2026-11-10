import type { PublicListingDraftFields } from './publicListingDraft';

const toNum = (v: unknown) => Number(String(v ?? '').replace(/[^\d.]/g, ''));

/** Exact missing pricing details; filled imported values count as complete without re-confirmation. */
export function pricingCardMissing(fields: PublicListingDraftFields): string[] {
  const out: string[] = [];
  if (!(toNum(fields.price) > 0)) out.push('מחיר הנכס');
  if (!(toNum(fields.commissionDeal) > 0)) out.push('עמלת סגירה');
  else if (fields.closingConfirmed === false && !fields.importedListing) out.push('אישור עמלת הסגירה (הזיזו את המחוון)');
  const labels: Record<string, string> = { commissionForm: 'תגמול טופס', commissionWhatsapp: 'תגמול ווטסאפ', commissionPhone: 'תגמול שיחה' };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    const value = (fields as any)[key];
    if (value == null || String(value).trim() === '') continue;
    if (!Number.isFinite(Number(value)) || Number(value) < 0) out.push(`${labels[key]} לא תקין`);
  }
  return out;
}

/** Pricing completion is independent of the separate legal consent controls. */
export function pricingCardComplete(fields: PublicListingDraftFields): boolean {
  return pricingCardMissing(fields).length === 0;
}
