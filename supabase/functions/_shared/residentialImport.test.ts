import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { residentialImportRejection as r } from './residentialImport.ts';
Deno.test('keeps residential sale and rent', () => {
  assertEquals(r({ deal_type: 'sale', attributes: { property_type: 'דירה' } }), null);
  assertEquals(r({ deal_type: 'rent', attributes: { property_type: 'פנטהאוז' } }), null);
});
Deno.test('skips commercial, office, shop, land and industry', () => {
  for (const t of ['משרדים', 'חנות', 'מגרש', 'מבנה תעשייה', 'נכס מסחרי']) assertEquals(r({ deal_type: 'sale', attributes: { property_type: t } }) !== null, true);
  assertEquals(r({ deal_type: 'rent', source_url: 'https://www.yad2.co.il/realestate/commercial/x' }), 'commercial');
});
Deno.test('skips deals that are neither sale nor rent', () => {
  assertEquals(r({ deal_type: 'other', attributes: { property_type: 'דירה' } }), 'not_sale_or_rent');
});
