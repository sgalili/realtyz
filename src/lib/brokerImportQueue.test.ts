import { beforeEach, describe, it, expect, vi } from 'vitest';
import { collectBrokers, nextImportPoint, validImportParameters, freshImportCheckpoint, skipRestrictedImport, advanceSearchPoint } from '../../supabase/functions/_shared/brokerImportQueue';
import { readWorkerResponse } from '../../supabase/functions/_shared/brightDataDiagnostics';
describe('broker discovery and resume',()=>{
  const rows=Array.from({length:5},(_,i)=>({source_url:`https://www.yad2.co.il/realestate/item/a${i}`,owner_phone:'0521234567',publisher:{publisher_kind:'broker',broker_name:'טל זנו',broker_license_number:'12345'}}));
  it('accepts target brokers and 3–10 active property bounds',()=>{expect(validImportParameters(25,3,10)).toBe(true);expect(validImportParameters(25,10,3)).toBe(false);expect(validImportParameters(1,3,11)).toBe(false);});
  it('requires the minimum and clips to the requested maximum',()=>{expect(collectBrokers(rows,3,4)[0].listing_urls).toHaveLength(4);expect(collectBrokers(rows.slice(0,2),3,4)).toHaveLength(0);});
  it('does not invent a missing license or phone',()=>{expect(collectBrokers([{...rows[0],owner_phone:null}],1,10)[0].phone).toBeNull();expect(collectBrokers([{...rows[0],publisher:{publisher_kind:'broker'}}],1,10)).toHaveLength(0);});
  it('resumes at the exact next listing and only advances broker on the last listing',()=>{expect(nextImportPoint(2,1,3)).toEqual({brokerIndex:2,listingIndex:2});expect(nextImportPoint(2,2,3)).toEqual({brokerIndex:3,listingIndex:0});});
});
describe('imports without a visible mobile', () => {
  it('groups a broker by license even when Yad2 hides the phone', async () => {
    const { collectBrokers } = await import('../../supabase/functions/_shared/brokerImportQueue');
    const row = (id: string) => ({ source_url: `https://www.yad2.co.il/realestate/item/${id}`, owner_phone: null, publisher: { publisher_kind: 'broker', broker_name: 'אדיר פנחס', broker_license_number: '3151443' } });
    const [b] = collectBrokers([row('aaaa1111'), row('bbbb2222'), row('cccc3333')], 3, 10);
    expect(b).toMatchObject({ license_number: '3151443', phone: null });
    expect(b.listing_urls).toHaveLength(3);
  });
});

describe('restricted listings and fresh pagination', () => {
  beforeEach(() => { Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal }); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  it('consumes a real 24-hour-limit response and advances rather than repeating the listing', async () => {
    const c = {phase:'importing',brokerIndex:0,listingIndex:0,brokers:[{listing_urls:['restricted','next']}],brokerId:'saved-account'};
    const transport = async () => new Response(JSON.stringify({error:'daily_import_limit',retry_at:'2026-11-12T05:22:00Z'}),{status:429});
    const error = await readWorkerResponse('https://worker.test',{},transport as typeof fetch).catch(e => e);
    expect(error.code).toBe('daily_import_limit');
    expect(skipRestrictedImport(c)).toEqual({brokerFinished:false});
    expect(c.listingIndex).toBe(1);
    expect(c.phase).toBe('importing');
    expect(c.brokerId).toBe('saved-account');
  });
  it('skips the last blocked listing without falsely counting a broker as imported', () => {
    const c:Record<string,any> = {phase:'importing',brokerIndex:0,listingIndex:0,brokers:[{listing_urls:['blocked']}],brokerId:'saved',brokerListingsDone:0};
    expect(skipRestrictedImport(c)).toEqual({brokerFinished:false});
    expect(c).toMatchObject({brokerIndex:1,listingIndex:0,phase:'validating'});
    expect(c.brokerId).toBeUndefined();
  });
  it('counts a broker with saved drafts when its final listing is skipped', () => {
    const c = {phase:'importing',brokerIndex:0,listingIndex:1,brokers:[{listing_urls:['saved','blocked']}],brokerListingsDone:1};
    expect(skipRestrictedImport(c)).toEqual({brokerFinished:true});
  });
  it('advances the page after the final restricted enrichment without losing previous discoveries/cache counters', () => {
    const c:Record<string,any> = {phase:'enriching',page:7,deal:'sale',enrichUrls:['blocked'],enriched:2,rows:[{source_url:'known'}],brokers:[],cacheHits:5};
    skipRestrictedImport(c);
    expect(c).toMatchObject({phase:'scanning',page:8,enriched:3,enrichUrls:[],rows:[{source_url:'known'}],cacheHits:5});
  });
  it('new import resets all offsets and active state and requests fresh search pages', () => {
    const old = {page:9,brokerIndex:4,listingIndex:3,waitUntil:999,rateRetries:2};
    const fresh = freshImportCheckpoint();
    expect(fresh).toEqual({page:1,deal:'sale',rows:[],brokers:[],brokerIndex:0,listingIndex:0,phase:'scanning',freshSearch:true});
    expect(old.page).toBe(9);
    expect('waitUntil' in fresh).toBe(false);
  });
  it('moves to rent after the last sale page and completes an exhausted empty search', () => {
    const c = {page:20,deal:'sale',phase:'scanning',brokers:[]};
    advanceSearchPoint(c);
    expect(c).toMatchObject({page:1,deal:'rent',phase:'scanning'});
    advanceSearchPoint(c,true);
    expect(c.phase).toBe('completed');
  });
});
