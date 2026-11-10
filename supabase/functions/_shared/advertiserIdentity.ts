/** Source placeholders are not advertiser identity; choose the next actual field instead. */
export function advertiserText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text || /לא צוין/.test(text) || /^(מפרסם המודעה|מוכר|משכיר|מפרסם פרטי|מוכר פרטי|משכיר פרטי|בעל הנכס|מתווך|פרטי)$/i.test(text)) continue;
    return text;
  }
  return '';
}

/** Explicit established office affiliation, never inferred from the importing workspace. */
export function affiliatedOffice(name: unknown, brand: { agency_name?: string | null; logo_url?: string | null; landscape_logo_url?: string | null } | null) {
  if (!['טל זנו', 'נוריאל יוסף', 'דולי אידלסון'].includes(advertiserText(name))) return null;
  return { office_name: advertiserText(brand?.agency_name) || 'אנגלו סכסון הרצליה', agency_logo_url: brand?.landscape_logo_url || brand?.logo_url || null };
}