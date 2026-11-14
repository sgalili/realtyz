import { describe, it, expect } from 'vitest';
import { load } from 'cheerio';
import { agencyPageUrl, agencyUrl, parseAgencies, parseAgencyProfile, agencyVolumeAllowed, agencyListingCount, agencyRegistryKey, recentAgencyCheck } from '../../supabase/functions/_shared/yad2Agencies';
import { collectBrokers, freshImportCheckpoint, advanceSearchPoint } from '../../supabase/functions/_shared/brokerImportQueue';

describe('agency directory discovery', () => {
  it('carries only the identified broker bio into the import checkpoint', () => {
    const html = '<header><h1>משרד</h1><div data-testid="broker-name">ישראל ישראלי</div><p>רישיון תיווך: 12345</p></header><p data-testid="broker-bio">ביו של המתווך</p><div class="related"><p data-testid="broker-bio">אדם אחר</p></div><a href="/realestate/item/abc123">דירה למכירה</a>';
    const rows = parseAgencyProfile(load(html), 'https://www.yad2.co.il/realestate/agency/123').results;
    expect(collectBrokers(rows, 1, 10)[0]?.imported_bio).toBe('ביו של המתווך');
  });
  it('keeps the agency description separate from the broker bio and carries it into import', () => {
    const html = '<header><h1>אנגלו סאקסון הרצליה</h1><div data-testid="broker-name">ישראל ישראלי</div><p>רישיון תיווך: 12345</p></header><section data-testid="agency-description">משרד בוטיק המלווה עסקאות מגורים בהרצליה.</section><p data-testid="broker-bio">ביו אישי של המתווך</p><a href="/realestate/item/abc123">דירה למכירה</a>';
    const rows = parseAgencyProfile(load(html), 'https://www.yad2.co.il/realestate/agency/123').results;
    const [broker] = collectBrokers(rows, 1, 10);
    expect(broker?.agency_description).toBe('משרד בוטיק המלווה עסקאות מגורים בהרצליה.');
    expect(broker?.imported_bio).toBe('ביו אישי של המתווך');
  });
  it('starts at the official agencies directory and advances directory pages only', () => {
    expect(agencyPageUrl(1)).toBe('https://www.yad2.co.il/realestate/agencies');
    expect(new URL(agencyPageUrl(2)).searchParams.get('page')).toBe('2');
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
  it('strips every geographic filter, even from next links', () => {
    const u=new URL(agencyPageUrl(2,'/realestate/agencies?page=2&city=2400&area=2&topArea=1'));
    expect([...u.searchParams.keys()]).toEqual(['page']);
    expect(u.searchParams.get('page')).toBe('2');
    const c:Record<string,any>={...freshImportCheckpoint(),cacheHits:4};
    advanceSearchPoint(c,true);
    expect(c).toMatchObject({phase:'completed',cacheHits:4});
  });
  it('reads kebab-case agency cards with their active property count', () => {
    const $=load('<main><div class="agency-item_box__x"><a href="/realestate/agency/777"><h3 class="agency-item_title__a">משרד ב</h3></a><span class="agency-item_assets__c">7 נכסים</span></div></main>');
    const {results}=parseAgencies($,'https://www.yad2.co.il/realestate/agencies');
    expect(results.find(r=>r.source_url.endsWith('/agency/777'))?.active_listing_count).toBe(7);
    expect(results.filter(r=>agencyVolumeAllowed(r,3,10))).not.toHaveLength(0);
    expect(results.filter(r=>agencyVolumeAllowed(r,8,10))).toHaveLength(0);
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