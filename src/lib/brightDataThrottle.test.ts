import { describe, expect, it } from 'vitest';
import { createProviderPacer, PROVIDER_GAP_MS, rateBackoffMs, retryAfterMs, MAX_AUTOMATIC_RATE_RETRIES } from '../../supabase/functions/_shared/brightDataThrottle';

describe('Bright Data throttling',()=>{
  it('serializes requests with a four-second gap after completion',async()=>{
    let time=0;const starts:number[]=[];let active=0;let maxActive=0;
    const paced=createProviderPacer(()=>time,async ms=>{time+=ms;});
    const run=()=>paced(async()=>{starts.push(time);active++;maxActive=Math.max(maxActive,active);await Promise.resolve();time+=1000;active--;return time;});
    await Promise.all([run(),run(),run()]);
    expect(PROVIDER_GAP_MS).toBe(4000);expect(starts).toEqual([0,5000,10000]);expect(maxActive).toBe(1);
  });
  it('paces the next request even after a failed request',async()=>{
    let time=0;const paced=createProviderPacer(()=>time,async ms=>{time+=ms;});
    await expect(paced(async()=>{throw new Error('429');})).rejects.toThrow('429');
    expect(await paced(async()=>time)).toBe(4000);
  });
  it('backs off exponentially with a bounded retry count',()=>{
    expect([1,2,3,4,5].map(n=>rateBackoffMs(n))).toEqual([10000,20000,40000,60000,60000]);
    expect(MAX_AUTOMATIC_RATE_RETRIES).toBe(5);
  });
  it('never retries before the provider Retry-After deadline',()=>{
    expect(rateBackoffMs(1,retryAfterMs('90'))).toBe(90000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT',0)).toBe(60000);
  });
});