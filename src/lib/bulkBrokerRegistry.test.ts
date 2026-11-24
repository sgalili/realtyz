import { expect, it, vi } from 'vitest';
import { redWaitingBrokers, recheckRedBrokers } from './bulkBrokerRegistry';
const red = { user_id: 'red', full_name: 'ממתין', license_number: '123', license_verified: false };
it('checks all red waiting brokers, not developers or verified records', async () => {
  const check=vi.fn().mockResolvedValue(true);
  const rows=[red,{...red,user_id:'verified',license_verified:true},{...red,user_id:'developer',is_developer:true},{...red,user_id:'red2',profile_license:'456'}];
  expect(redWaitingBrokers(rows)).toHaveLength(2);
  const result=await recheckRedBrokers(rows,check,vi.fn(),()=>true);
  expect(check.mock.calls.map(([r,l])=>[r.user_id,l])).toEqual([['red','123'],['red2','456']]); expect(result).toMatchObject({done:2,verified:2});
});
it('reports missing/invalid licenses without sending invalid checks', async () => {
  const check=vi.fn(); const result=await recheckRedBrokers([{...red,license_number:null},{...red,user_id:'bad',license_number:'000'}],check,vi.fn(),()=>true);
  expect(check).not.toHaveBeenCalled(); expect(result).toMatchObject({done:2,missing:2,verified:0});
});
it('continues after a not-found result and a failed check, without false success',async()=>{const check=vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(Error()).mockResolvedValueOnce(true);expect(await recheckRedBrokers([red,{...red,user_id:'b'},{...red,user_id:'c'}],check,vi.fn(),()=>true)).toMatchObject({done:3,failed:2,verified:1});});
it('stops starting checks when the authorized account changes',async()=>{let current=true;const check=vi.fn(async()=>{current=false;return true;});expect(await recheckRedBrokers([red,{...red,user_id:'b'}],check,vi.fn(),()=>current)).toBeNull();expect(check).toHaveBeenCalledTimes(1);});