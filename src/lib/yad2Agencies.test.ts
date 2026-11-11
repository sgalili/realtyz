import { describe, it, expect } from 'vitest';
import { load } from 'cheerio';
import { agencyPageUrl, agencyUrl, parseAgencies, agencyVolumeAllowed, agencyListingCount, agencyRegistryKey, recentAgencyCheck } from '../../supabase/functions/_shared/yad2Agencies';
import { collectBrokers, freshImportCheckpoint, advanceSearchPoint } from '../../supabase/functions/_shared/brokerImportQueue';

describe('agency directory discovery', () => {
  it('starts at the official agencies directory and advances directory pages only', () => {
    expect(agencyPageUrl(1)).toBe('https://www.yad2.co.il/realestate/agencies?city=6400&area=18');
    expect(new URL(agencyPageUrl(2)).searchParams.get('page')).toBe('2');
    const c = freshImportCheckpoint(); advanceSearchPoint(c); expect(c.page).toBe(2);
    advanceSearchPoint(c,true); expect(c.cityIndex).toBe(1);
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
    expect(next_url).toBe('https://www.yad2.co.il/realestate/agencies?page=2');
    expect(collectBrokers(results,1,10)).toEqual([]);
  });
});

describe('early agency filtering and seven-day registry', () => {
  it('extracts card count before choosing any deep links, including duplicate link representations', () => {
    const html='<main><article data-testid="agency-card"><h2>משרד א</h2><a href="/realestate/agency/12345/forsale">משרד</a><p>714 נכסים מתאימים לך</p></article></main>';
    const rows=parseAgencies(load(html),agencyPageUrl(1)).results;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r=>r.active_listing_count===714)).toBe(true);
    expect(rows.filter(r=>agencyVolumeAllowed(r,3,10))).toEqual([]);
  });
  it('accepts exactly 3–10 properties and rejects both bounds outside that range', () => {
    expect([2,3,10,11].map(active_listing_count=>agencyVolumeAllowed({active_listing_count},3,10))).toEqual([false,true,true,false]);
    expect(agencyListingCount('1,250 נכסים מתאימים לך')).toBe(1250);
    expect(agencyVolumeAllowed({active_listing_count:null},3,10)).toBe(true);
  });
  it('passes structured agency volume and URL to its own broker without requiring mobile', () => {
    const data={agencies:[{url:'/realestate/agency/12345/forsale',name:'משרד',activeListingCount:3,brokers:[{fullName:'טל זנו',licenseNumber:'12345',listings:['/realestate/item/aa1','/realestate/item/aa2','/realestate/item/aa3']}]}]};
    const rows=parseAgencies(load(`<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`),agencyPageUrl(1)).results;
    const eligible=rows.filter(r=>agencyVolumeAllowed(r,3,10));
    expect(eligible.every(r=>r.active_listing_count===3)).toBe(true);
    expect(collectBrokers(eligible,3,10)[0]).toMatchObject({license_number:'12345',phone:null});
  });
  it('keeps pagination city-scoped even when next links drop or change geography', () => {
    const u=new URL(agencyPageUrl(2,1,'/realestate/agencies?page=2&city=2400'));
    expect(u.searchParams.get('city')).toBe('5000');
    expect(u.searchParams.get('area')).toBe('2');
    expect(u.searchParams.get('page')).toBe('2');
    const c:Record<string,any>={...freshImportCheckpoint(),directoryNextUrl:'old',directoryPages:['old'],cacheHits:4};
    advanceSearchPoint(c,true);
    expect(c).toMatchObject({cityIndex:1,page:1,phase:'scanning',cacheHits:4});
    expect(c.directoryNextUrl).toBeUndefined();
  });
  it('skips completed checks for exactly seven days without extending their timestamp', () => {
    const checked='2026-11-01T00:00:00Z';const start=Date.parse(checked);
    expect(recentAgencyCheck(checked,start+7*86400_000-1)).toBe(true);
    expect(recentAgencyCheck(checked,start+7*86400_000)).toBe(false);
    expect(recentAgencyCheck('invalid',start)).toBe(false);
  });
  it('uses one registry identity across agency sale/rent links and excludes directory pages', () => {
    expect(agencyRegistryKey({source_url:'https://www.yad2.co.il/realestate/agency/12345/forsale?city=6400'})).toBe(agencyRegistryKey({source_url:'https://www.yad2.co.il/realestate/agency/12345/rent'}));
    expect(agencyRegistryKey({source_url:agencyPageUrl(1)})).toBeNull();
  });
});