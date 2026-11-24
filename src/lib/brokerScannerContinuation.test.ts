import { expect, it, vi } from 'vitest';
import { continueBrokerScanner } from '../../supabase/functions/_shared/brokerScannerContinuation';
const job={id:'job',broker_id:'broker',listing_id:'listing',source_url:'https://www.yad2.co.il/realestate/item/test',created_by:'admin'};
function mockAdmin({paused=false,contact=false,eligible=true,duplicate=false}={}) {
  const insert=vi.fn().mockResolvedValue({error:duplicate?{code:'23505'}:null});
  const rpc=vi.fn().mockResolvedValue({data:eligible});
  return {insert,rpc,from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='broker_wa_scanner_settings'?{enabled:true,paused}:contact?{broker_id:'broker'}:null}),insert};return q;}};
}
it('continues the exact authorized single or bulk source independently of mounted cards',async()=>{const a=mockAdmin();expect(await continueBrokerScanner(a,job)).toBe(true);expect(a.insert).toHaveBeenCalledWith(expect.objectContaining({broker_id:'broker',workspace_owner_id:'broker',listing_id:'listing',created_by:'admin',source_url:job.source_url}));});
it('does not bypass an explicitly paused scanner',async()=>{const a=mockAdmin({paused:true});expect(await continueBrokerScanner(a,job)).toBe(false);expect(a.insert).not.toHaveBeenCalled();});
it('does not queue after a manual number has been saved',async()=>{const a=mockAdmin({contact:true});expect(await continueBrokerScanner(a,job)).toBe(false);expect(a.insert).not.toHaveBeenCalled();});
it('does not queue an unauthorized source',async()=>{const a=mockAdmin({eligible:false});expect(await continueBrokerScanner(a,job)).toBe(false);expect(a.insert).not.toHaveBeenCalled();});
it('does not create a duplicate inquiry on a retry',async()=>{expect(await continueBrokerScanner(mockAdmin({duplicate:true}),job)).toBe(false);});
it('retries a transient eligibility read without re-reading a source or creating multiple inquiries',async()=>{
  vi.useFakeTimers();
  try {
    const a=mockAdmin();a.rpc.mockResolvedValueOnce({error:new TypeError('connection reset')}).mockResolvedValueOnce({data:true});
    const work=continueBrokerScanner(a,job);await vi.runAllTimersAsync();
    expect(await work).toBe(true);expect(a.rpc).toHaveBeenCalledTimes(2);expect(a.insert).toHaveBeenCalledTimes(1);
  } finally {vi.useRealTimers();}
});