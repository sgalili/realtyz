export function templateParamDefault(key: string): string {
  if (/^(first_name|firstname|name|full_name|lead_name|customer_name|client_name)$/i.test(key)) return '[שם_פרטי]';
  if (/^(city)$/i.test(key)) return '[עיר]';
  if (/^(property|property_address|listing_address|address)$/i.test(key)) return '[נכס]';
  return '';
}

export function propertyTemplateParam(key: string, property: { property_title: string | null; address: string | null; city: string | null } | null): string | undefined {
  const token = templateParamDefault(key);
  if (token === '[נכס]') return property ? [property.property_title, property.address, property.city].filter(Boolean).join(' · ') : token;
  if (token === '[עיר]') return property?.city || token;
  return undefined;
}