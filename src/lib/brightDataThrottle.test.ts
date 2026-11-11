import { describe, expect, it } from 'vitest';
import { createProviderPacer, PROVIDER_GAP_MS, rateBackoffMs, retryAfterMs, rateCooldownRemaining } from '../../supabase/functions/_shared/brightDataThrottle';

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
  it('starts cooldown at five minutes and extends repeated manual rate failures',()=>{
    expect([1,2,3,4,5].map(n=>rateBackoffMs(n))).toEqual([300000,600000,1200000,2400000,3600000]);
  });
  it('never retries before the provider Retry-After deadline',()=>{
    expect(rateBackoffMs(1,retryAfterMs('900'))).toBe(900000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT',0)).toBe(60000);
  });
  it('blocks resume until the full five-minute cooldown expires',()=>{
    const c={waitReason:'rate_limit',waitUntil:301000};
    expect(rateCooldownRemaining(c,1000)).toBe(300000);
    expect(rateCooldownRemaining(c,300999)).toBe(1);
    expect(rateCooldownRemaining(c,301000)).toBe(0);
  });
});