import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleBrokerDemo } from './brokerOutreach.server';
afterEach(()=>vi.unstubAllGlobals());
describe('broker demo call provider fence',()=>{
 it('rejects a non-Twilio Vapi line without creating a phone call',async()=>{
  const events:unknown[]=[];
  const admin={from:(table:string)=>{
    const query:any={};
    for(const method of ['select','eq','update','in'])query[method]=()=>query;
    query.maybeSingle=async()=>({data:{api_key:'test-key:test-phone'},error:null});
    query.insert=(value:unknown)=>{events.push(value);return Promise.resolve({error:null});};
    query.then=(resolve:(value:unknown)=>void)=>resolve({error:null});return query;
  }};
  const fetchMock=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify({provider:'vapi'})));
  vi.stubGlobal('fetch',fetchMock);
  await scheduleBrokerDemo(admin as never,'00000000-0000-0000-0000-000000000010');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.vapi.ai/phone-number/test-phone');
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  expect(events).toEqual([expect.objectContaining({kind:'call_schedule_failed'})]);
 });
});