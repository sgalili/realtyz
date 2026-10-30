export function templateParamDefault(key: string): string {
  if (/^(first_name|firstname|name|full_name|lead_name|customer_name|client_name)$/i.test(key)) return '[שם_פרטי]';
  if (/^(city)$/i.test(key)) return '[עיר]';
  if (/^(property|property_address|listing_address|address)$/i.test(key)) return '[נכס]';
  return '';
}