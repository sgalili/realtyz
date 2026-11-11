import { describe, it, expect } from 'vitest';
import { collectBrokers, nextImportPoint, validImportParameters } from '../../supabase/functions/_shared/brokerImportQueue';
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
