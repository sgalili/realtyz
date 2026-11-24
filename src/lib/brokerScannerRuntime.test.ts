import { afterEach, expect, it, vi } from 'vitest';
// Keep server-only imports out of the browser TypeScript project; Vitest loads them with the mocks below.
const runtimePath = '../../supabase/functions/_shared/brokerScannerRuntime';
const { processScannerEvent, scannerGreen } = await import(runtimePath);
vi.mock('../../supabase/functions/_shared/authz.ts',()=>({adminClient:vi.fn(),safeEqual:(a:string,b:string)=>a===b}));
vi.mock('../../supabase/functions/_shared/brokerWhatsApp.ts',()=>({normalizeBrokerWhatsApp:(phone:string)=>phone,primaryListing:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function setupCredentials() {
  const values:Record<string,string>={GREEN_SCANNER_INSTANCE_ID:'1234567890',GREEN_SCANNER_API_TOKEN:'test-only-api-token',GREEN_SCANNER_WEBHOOK_TOKEN:'test-only-webhook-token-32-characters'};
  vi.stubGlobal('Deno',{env:{get:(key:string)=>values[key]}});
  vi.stubGlobal('AbortSignal',{timeout:()=>undefined});
}
it.each(['getStateInstance','getSettings'])('retries only the safe provider read %s after a reset',async(method)=>{
  setupCredentials();vi.useFakeTimers();
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('connection reset')).mockResolvedValueOnce(new Response(JSON.stringify({stateInstance:'authorized'})));
  vi.stubGlobal('fetch',fetcher);
  const work=scannerGreen(method);await vi.runAllTimersAsync();
  expect(await work).toEqual({stateInstance:'authorized'});expect(fetcher).toHaveBeenCalledTimes(2);
});
it('never replays a sendMessage after a lost provider response',async()=>{
  setupCredentials();const fetcher=vi.fn().mockRejectedValue(new TypeError('connection reset'));vi.stubGlobal('fetch',fetcher);
  await expect(scannerGreen('sendMessage',{chatId:'test@c.us',message:'test-only'})).rejects.toMatchObject({status:504});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('retries an event read, then leaves an already completed event untouched',async()=>{
  vi.useFakeTimers();const single=vi.fn().mockResolvedValueOnce({error:new TypeError('connection reset')}).mockResolvedValueOnce({data:{id:'event',status:'completed'}});
  const from=vi.fn(()=>({select:()=>({eq:()=>({single})})}));const rpc=vi.fn();
  const work=processScannerEvent('event',{from,rpc} as any);await vi.runAllTimersAsync();await work;
  expect(single).toHaveBeenCalledTimes(2);expect(rpc).not.toHaveBeenCalled();
});