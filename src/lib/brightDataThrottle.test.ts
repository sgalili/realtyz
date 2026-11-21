import { describe, expect, it } from 'vitest';
import { adaptPaceGap, createProviderPacer, PROVIDER_GAP_MS, rateBackoffMs, retryAfterMs, rateCooldownRemaining } from '../../supabase/functions/_shared/brightDataThrottle';

describe('Bright Data throttling',()=>{
  it('serializes requests with a 12-second gap within the requested 10–15 seconds',async()=>{
    let time=0;const starts:number[]=[];let active=0;let maxActive=0;
    const paced=createProviderPacer(()=>time,async ms=>{time+=ms;});
    const run=()=>paced(async()=>{starts.push(time);active++;maxActive=Math.max(maxActive,active);await Promise.resolve();time+=1000;active--;return time;});
    await Promise.all([run(),run(),run()]);
    expect(PROVIDER_GAP_MS).toBe(12000);expect(starts).toEqual([0,13000,26000]);expect(maxActive).toBe(1);
  });
  it('paces the next request even after a failed request',async()=>{
    let time=0;const paced=createProviderPacer(()=>time,async ms=>{time+=ms;});
    await expect(paced(async()=>{throw new Error('429');})).rejects.toThrow('429');
    expect(await paced(async()=>time)).toBe(12000);
  });
  it('keeps 429 waits short: 15s growing to a 2-minute ceiling',()=>{
    expect([1,2,3,4,5,9].map(n=>rateBackoffMs(n))).toEqual([15000,30000,60000,90000,120000,120000]);
  });
  it('honors a short provider Retry-After but caps a long one at 3 minutes',()=>{
    expect(rateBackoffMs(1,retryAfterMs('45'))).toBe(45000);
    expect(rateBackoffMs(1,retryAfterMs('900'))).toBe(180000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT',0)).toBe(60000);
  });
  it('reads the remaining cooldown from the saved deadline, so a refresh never resets it',()=>{
    const c={waitReason:'rate_limit',waitUntil:16000};
    expect(rateCooldownRemaining(c,1000)).toBe(15000);
    expect(rateCooldownRemaining(c,15999)).toBe(1);
    expect(rateCooldownRemaining(c,16000)).toBe(0);
  });
  it('widens the gap between requests after a 429 and eases back after successes',()=>{
    expect(adaptPaceGap(1000,'rate_limit',1000)).toBe(3000);
    expect(adaptPaceGap(10000,'rate_limit',1000)).toBe(15000);
    expect(adaptPaceGap(10000,'success',1000)).toBe(8000);
    expect(adaptPaceGap(1000,'success',1000)).toBe(1000);
    expect(adaptPaceGap(undefined,'success',0)).toBe(0);
  });
});