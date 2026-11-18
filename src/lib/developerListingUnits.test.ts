import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { readPage } from '../../supabase/functions/_shared/yad2DeveloperImport';
describe('project apartments', () => {
  it('stores every embedded listing as its own unit', () => {
    const listings = [1, 2].map(n => ({ listingId: `10${n}`, price: 3000000 + n, projectYzerId: 6881, additionalDetails: { roomsCount: 4 + n, property: { text: 'דירה' } } }));
    const html = `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { project: { projectYzerId: 6881, projectName: 'MOMENT' }, listings } } })}</script>`;
    const r = readPage(html, 'https://www.yad2.co.il/yad1/project/6881');
    const p = r.projects.find((x: any) => String(x.source_project_id) === '6881');
    expect(p.apartments.map((u: any) => [u.source_unit_id, u.rooms, u.price])).toEqual([['101', 5, 3000001], ['102', 6, 3000002]]);
  });
  it.skipIf(!existsSync('/tmp/y2/p.html'))('reads the live MOMENT page', () => {
    const r = readPage(readFileSync('/tmp/y2/p.html', 'utf8'), 'https://www.yad2.co.il/yad1/project/6881');
    console.log(r.projects.map((p: any) => [p.name, p.apartments?.length]));
  });
});
