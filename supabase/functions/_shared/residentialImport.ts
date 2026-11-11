// Broker imports keep only residential sale/rent ads; commercial, offices,
// shops, land, industry and other non-residential categories are skipped.
const NON_RESIDENTIAL = /(commercial|office|store|shop|retail|industr|warehouse|land|plot|parking|hotel|clinic|מסחרי|משרד|חנות|חנויות|מגרש|קרקע|תעשי|מחסן|חניה|חנייה|מבנה תעשייה|אולם|מרפאה|בית מלון|נחלה|משק חקלאי)/i;
export function residentialImportRejection(row: { deal_type?: string | null; source_url?: string | null; title?: string | null; attributes?: Record<string, unknown> | null; raw?: any }): string | null {
  const deal = String(row.deal_type ?? '').toLowerCase();
  if (deal !== 'sale' && deal !== 'rent') return 'not_sale_or_rent';
  const a = row.attributes ?? {};
  const bucket = String(row.raw?.bucket ?? row.raw?.source_bucket ?? (a as any).source_bucket ?? '').toLowerCase();
  if (bucket === 'commercial' || /\/realestate\/commercial/i.test(String(row.source_url ?? ''))) return 'commercial';
  const type = [a.property_type, a.propertyType, a.subcategory, (a as any).category].filter(Boolean).join(' ');
  if (type && NON_RESIDENTIAL.test(type)) return 'non_residential';
  if (!type && NON_RESIDENTIAL.test(String(row.title ?? ''))) return 'non_residential';
  return null;
}
