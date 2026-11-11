import { describe, it, expect } from 'vitest';
import { load } from 'cheerio';
import { agencyPageUrl, agencyUrl, parseAgencies } from '../../supabase/functions/_shared/yad2Agencies';
import { collectBrokers, freshImportCheckpoint, advanceSearchPoint } from '../../supabase/functions/_shared/brokerImportQueue';

describe('agency directory discovery', () => {
  it('starts at the official agencies directory and advances directory pages only', () => {
    expect(agencyPageUrl(1)).toBe('https://www.yad2.co.il/realestate/agencies');
    expect(agencyPageUrl(2)).toBe('https://www.yad2.co.il/realestate/agencies?page=2');
    const c = freshImportCheckpoint(); advanceSearchPoint(c); expect(c.page).toBe(2);
    advanceSearchPoint(c,true); expect(c.phase).toBe('completed');
  });
  it('retains explicit license identity and draft links when mobile is hidden', () => {
    const html = `<main><article data-testid="broker-card"><span data-testid="broker-name">אדיר פנחס</span><h2>משרד א</h2><p>רישיון תיווך: 3151443</p><a href="/realestate/agencies/office-a">משרד</a><a href="/realestate/item/aaaa1111">נכס</a></article></main>`;
    const {results} = parseAgencies(load(html),agencyPageUrl(1));
    expect(collectBrokers(results,1,10)[0]).toMatchObject({full_name:'אדיר פנחס',license_number:'3151443',phone:null,office_name:'משרד א',listing_urls:['https://www.yad2.co.il/realestate/item/aaaa1111']});
  });
  it('does not create a broker from office name or recommended listing identity', () => {
    const html = `<main><h1>משרדי תיווך</h1><article data-testid="agency-card"><h2>רימקס</h2><a href="/realestate/agencies/remax">משרד</a></article><script id="__NEXT_DATA__">${JSON.stringify({agencies:[{name:'רימקס',url:'/realestate/agencies/remax',listings:[{broker_name:'אדם אחר',licenseNumber:'12345'}]}]})}</script></main>`;
    expect(collectBrokers(parseAgencies(load(html),agencyPageUrl(1)).results,1,10)).toEqual([]);
  });
  it('extracts scoped structured contacts without confusing office and personal names', () => {
    const data={agencies:[{name:'משרד',url:'/realestate/agencies/a',brokers:[{fullName:'טל זנו',licenseNumber:'12345',mobile:'0521234567',email:'tal@example.test',listings:[{url:'/realestate/item/abc123'}]}]}]};
    const {results}=parseAgencies(load(`<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`),agencyPageUrl(1));
    expect(collectBrokers(results,1,10)[0]).toMatchObject({full_name:'טל זנו',phone:'972521234567',email:'tal@example.test',office_name:'משרד'});
  });
  it('rejects challenges and external pagination instead of reporting exhaustion', () => {
    expect(()=>parseAgencies(load('<title>Radware Page</title>'),agencyPageUrl(1))).toThrow();
    expect(agencyUrl('https://evil.test/realestate/agencies?page=2')).toBeNull();
    expect(agencyUrl('/realestate/agency/6135542/forsale')).toBe('https://www.yad2.co.il/realestate/agency/6135542/forsale');
  });
  it('reads real singular agency links and preserves explicit next-page navigation', () => {
    const {results,next_url}=parseAgencies(load('<main><a href="/realestate/agency/6135542/forsale"><h2>רימקס Success</h2></a><a rel="next" href="/realestate/agencies?page=2">הבא</a></main>'),agencyPageUrl(1));
    expect(results[0].source_url).toBe('https://www.yad2.co.il/realestate/agency/6135542/forsale');
    expect(next_url).toBe(agencyPageUrl(2));
    expect(collectBrokers(results,1,10)).toEqual([]);
  });
});