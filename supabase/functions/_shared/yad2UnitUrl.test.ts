import { assertEquals } from 'jsr:@std/assert@1';
import { projectListingUnits } from './yad2DeveloperImport.ts';
Deno.test('each project apartment keeps its direct Yad2 ad link', () => {
  const [u] = projectListingUnits([{ listingId: 5, token: 'abc123' }], 'https://www.yad2.co.il/yad1/project/9');
  assertEquals(u.source_url, 'https://www.yad2.co.il/realestate/item/abc123');
});
