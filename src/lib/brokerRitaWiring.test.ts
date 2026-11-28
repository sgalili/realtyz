import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleBrokerDemo, sendBrokerVoice } from './brokerOutreach.server';
const context=vi.hoisted(()=>({firstName:'דנה',gender:'female',propertyContext:'הרצל, תל אביב',draftCount:2,system:'Canonical Rita global brain',facts:'Broker-local facts'}));
vi.mock('./brokerRitaContext.server',()=>({loadBrokerRitaContext:vi.fn(async()=>context),generateBrokerRitaScript:vi.fn(async()=> 'שלום דנה, אני ריטה. אפשר לכתוב לי בוואטסאפ הרשמי לתמיכה.')}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function client(){
 const due=new Date(Date.now()+60_000).toISOString();
 const journey={enabled:true,call_consent_at:'saved',interested_at:new Date().toISOString(),call_due_at:due,cancel_requested_at:null,otp_verified_phone:'972500000000',voice_status:'pending',outreach_channel:'whatsapp',created_by:'admin'};
 const admin={rpc:vi.fn(async()=>({data:true,error:null})),from:(table:string)=>{
  const q:any={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,order:()=>q,limit:()=>q};
  q.update=()=>q;q.insert=async()=>({error:null});
  q.single=async()=>({data:table==='profiles'?{full_name:'דנה כהן',gender:'female'}:table==='broker_whatsapp_contacts'?{whatsapp_phone:'972500000000'}:journey,error:null});
  q.maybeSingle=async()=>({data:table==='api_configs'?{api_key:'key:phone'}:{broker_id:'broker'},error:null});
  q.then=(resolve:(v:unknown)=>void)=>resolve({error:null});return q;
 },storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async()=>{journey.enabled=false;return {data:{signedUrl:'https://example.test/audio'},error:null};}})}};
 return {admin,due};
}
describe('Rita stage payloads',()=>{
 it('passes generated Rita text and existing v3 voice settings to ElevenLabs without sending',async()=>{
  vi.stubEnv('ELEVENLABS_API_KEY','test');vi.stubEnv('LOVABLE_API_KEY','test');
  const fetchMock=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(new Uint8Array([1,2])));vi.stubGlobal('fetch',fetchMock);
  await sendBrokerVoice(client().admin as never,'broker');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call=fetchMock.mock.calls[0];expect(call?.[0]).toContain('/t1FxSQNdBrLMfytJMHmg?output_format=mp3_44100_128');
  const body=JSON.parse(String(call?.[1]?.body));expect(body.model_id).toBe('eleven_v3');expect(body.voice_settings.similarity_boost).toBe(0.9);expect(body.text).toContain('שלום דנה');
 });
 it('queues the consent-gated delayed invitation without a browser-owned call request',async()=>{
  const {admin}=client();
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  await scheduleBrokerDemo(admin as never,'broker');
  expect(admin.rpc).toHaveBeenCalledWith('arm_rita_broker_demo',{_broker:'broker'});
  expect(fetchMock).not.toHaveBeenCalled();
 });
});