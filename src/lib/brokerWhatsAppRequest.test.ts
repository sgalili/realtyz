import { afterEach, expect, it, vi } from 'vitest';
import { brokerWhatsAppRequest } from './brokerWhatsAppRequest';
const state=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
afterEach(()=>{state.invoke.mockReset();vi.useRealTimers();});
it('retries status reads and returns the existing job unchanged', async()=>{
  vi.useFakeTimers();
  const data={job:{id:'job',status:'pending'},used_today:3};
  state.invoke.mockRejectedValueOnce(new TypeError('connection reset')).mockResolvedValueOnce({data,error:null});
  const result=brokerWhatsAppRequest('broker-whatsapp-worker',{action:'status',broker_id:'broker'});
  await vi.runAllTimersAsync();
  expect(await result).toBe(data);expect(state.invoke).toHaveBeenCalledTimes(2);
});
it('bounds exhausted status retries and emits a sanitized error', async()=>{
  vi.useFakeTimers();state.invoke.mockRejectedValue(new TypeError('connection reset 127.0.0.1:443'));
  const result=brokerWhatsAppRequest('broker-whatsapp-worker',{action:'status'}).catch(error=>error);
  await vi.runAllTimersAsync();
  expect(state.invoke).toHaveBeenCalledTimes(3);expect((await result).message).not.toMatch(/connection reset|127\.0\.0\.1|443/);
});
it.each(['enqueue','save_contact','start_batch','enqueue_missing','resume'])('never replays a %s mutation on a network error',async(action)=>{
  state.invoke.mockRejectedValue(new TypeError('connection reset'));
  await expect(brokerWhatsAppRequest('broker-whatsapp-worker',{action})).rejects.toBeInstanceOf(Error);
  expect(state.invoke).toHaveBeenCalledTimes(1);
});