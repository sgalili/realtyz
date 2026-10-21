import { cleanPayload } from './cleanValues.ts';
import { maskContactText } from './publicMask.ts';

// Keep property specifications, never contacts, finance, internal identifiers
// or arbitrary source payloads, even when nested inside a unit snapshot.
const allowed = /^(rooms|floor|size_sqm|price|balcony_sqm|garden_sqm|parking|count|type|building_name|address|city|neighborhood|description|specifications|specification|amenities|features|exposure|view|bathrooms|bedrooms|storage|elevator|mamad|air_conditioning|delivery_date|availability|total_floors|קומה|חדרים|שטח|מרפסת|חניה|מפרט|כיווני אוויר|ממ״ד|מחסן)$/i;
export function publicDeveloperDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean = (v: unknown): unknown => {
    if (typeof v === 'string') return maskContactText(v);
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return publicDeveloperDetails(v);
    return v;
  };
  return cleanPayload(Object.fromEntries(Object.entries(value).filter(([key]) => allowed.test(key)).map(([key, v]) => [key, clean(v)])));
}