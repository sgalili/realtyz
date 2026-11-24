import { describe, expect, it } from 'vitest';
import { loadBrokerRitaContext } from './brokerRitaContext.server';
import { IVR_DEFAULT_VOICES, IVR_MODEL_ID, IVR_VOICE_SETTINGS } from '../../supabase/functions/_shared/ivrVoices';
import { buildRitaOutreachPrompt, RITA_IDENTITY_RULES } from '../../supabase/functions/_shared/masterAgentPromptText';
import { shortBrokerDemoCall } from './brokerOutreachPolicy';
describe('shared Rita outreach context',()=>{
 it('uses the existing Rita voice and v3 narration settings',()=>{
  expect(IVR_DEFAULT_VOICES[0].voice_id).toBe('t1FxSQNdBrLMfytJMHmg');
  expect(IVR_MODEL_ID).toBe('eleven_v3');expect(IVR_VOICE_SETTINGS.similarity_boost).toBe(0.9);
 });
 it('loads only the intended broker drafts and shared global brain',async()=>{
  const scopes:string[]=[];
  const admin={from:(table:string)=>{
   scopes.push(table);const q:any={select:()=>q,eq:(field:string,value:unknown)=>{scopes.push(`${table}:${field}:${value}`);return q;},order:()=>q,limit:()=>q};
   const data=table==='profiles'?{full_name:'דנה כהן',gender:'female'}:table==='global_ai_documents'?[{raw_text:'כלל ריטה משותף'}]:{address:'הרצל 10',city:'תל אביב'};
   q.single=async()=>({data,error:null});q.maybeSingle=q.single;q.then=(resolve:(v:unknown)=>void)=>resolve({data,count:5,error:null});return q;
  }};
  const context=await loadBrokerRitaContext(admin as never,'broker-one');
  expect(context.firstName).toBe('דנה');expect(context.gender).toBe('female');
  expect(context.propertyContext).toBe('הרצל, תל אביב');expect(context.draftCount).toBe(5);
  expect(scopes.filter(s=>s.startsWith('listings:workspace_owner_id:'))).toEqual(['listings:workspace_owner_id:broker-one','listings:workspace_owner_id:broker-one']);
  expect(scopes).not.toContain('knowledge_documents');expect(scopes).not.toContain('agent_personas');
  expect(context.system).toContain(RITA_IDENTITY_RULES);expect(context.system).toContain('כלל ריטה משותף');
 });
 it('keeps the short demo tool-free and stops on request',()=>{
  const demo=shortBrokerDemoCall('דנה','female');
  expect(demo.maxDurationSeconds).toBe(90);
  expect(buildRitaOutreachPrompt('')).toContain(RITA_IDENTITY_RULES);
  expect(demo.prompt).toContain('אם מבקשים להפסיק, סיימי מיד');
 });
});