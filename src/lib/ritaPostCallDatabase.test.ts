import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '00000000-0000-0000-0000-000000000034';
const other = '00000000-0000-0000-0000-000000000035';
const contextId = '00000000-0000-0000-0000-000000000036';
const leadId = '00000000-0000-0000-0000-000000000037';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA realtime;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.topic',true) $$;
    CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TABLE realtime.messages(id uuid); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, phone text);
    CREATE TABLE public.workspace_memberships(workspace_owner_id uuid,user_id uuid);
    CREATE TABLE public.user_roles(user_id uuid,role text);
    CREATE TABLE public.leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid,full_name text,phone_number text,city text,deal_type text,linked_listing_id uuid,lead_stage text,status text,last_interaction_at timestamptz,created_at timestamptz DEFAULT now(),preferences jsonb,notes text);
    CREATE TABLE public.rita_call_contexts(id uuid PRIMARY KEY,workspace_owner_id uuid,lead_id uuid,property_id uuid,direction text,full_name text,lead_phone text,source text,property_context jsonb,dynamic_variables jsonb,source_context jsonb,conversation_id text,status text,qualification jsonb,matched_property_ids uuid[],transcript_summary text,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE public.call_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lead_id uuid,elevenlabs_conversation_id text,caller_phone text,direction text,handled_by text,status text,duration_seconds int,transcript jsonb,transcript_text text,summary text,needs_callback boolean,callback_reason text,started_at timestamptz,ended_at timestamptz,metadata jsonb);
    CREATE UNIQUE INDEX call_conversation_unique ON public.call_records(elevenlabs_conversation_id) WHERE elevenlabs_conversation_id IS NOT NULL;
    CREATE TABLE public.messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid,direction text,sender_type text,platform text,channel text,content text,metadata jsonb);
    CREATE UNIQUE INDEX messages_external_unique ON public.messages((metadata->>'external_id')) WHERE metadata->>'external_id' IS NOT NULL;
    CREATE TABLE public.broker_outreach_journeys(broker_id uuid,call_provider_id text,call_status text,last_error text);
    CREATE TABLE public.broker_outreach_events(broker_id uuid,workspace_owner_id uuid,event_key text UNIQUE,kind text,detail jsonb);
    GRANT USAGE ON SCHEMA public,auth,realtime TO authenticated;
    GRANT SELECT ON public.call_records TO authenticated;
    ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY existing_owner_read ON public.call_records FOR SELECT TO authenticated USING(user_id=auth.uid());`);
  await db.exec(readFileSync('drizzle/migrations/0325_rita_atomic_post_call_cards.sql','utf8'));
  await db.exec(readFileSync('drizzle/migrations/0326_rita_post_call_property_array.sql','utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`DELETE FROM public.messages; DELETE FROM public.call_records; DELETE FROM public.rita_call_contexts; DELETE FROM public.leads; DELETE FROM public.profiles; DELETE FROM public.broker_outreach_events;
    INSERT INTO public.profiles VALUES('${owner}','0500000034'),('${other}','0500000035');
    INSERT INTO public.rita_call_contexts(id,workspace_owner_id,conversation_id,direction,lead_phone,full_name,source,property_context,dynamic_variables) VALUES('${contextId}','${owner}','conversation-a','inbound','+972500000099','דנה כהן','inbound_twilio','{}','{"call_role":"property_lead"}');`);
});
afterAll(async () => { await db.close(); });
const result = (started = '2026-11-28T09:00:00Z') => ({ started_at: started, full_name:'דנה כהן', caller_phone:'+972500000099', duration_seconds:72, needs_callback:true, summary:'מחפשת דירה בהרצליה.\nביקשה לחזור מחר.', transcript:[],transcript_text:'שלום דנה',qualification:{budget_financing:'עד 3 מיליון',timeline_urgency:'תוך חודש',area_flexibility:'הרצליה',viewing_availability:null,next_step:'חזרה מחר',requested_callback:true},matched_property_ids:[],compact:{bullets:['מחפשת דירה בהרצליה.','ביקשה לחזור מחר.'],qualification:{budget_financing:'עד 3 מיליון',timeline_urgency:'תוך חודש',area_flexibility:'הרצליה',viewing_availability:null,next_step:'חזרה מחר',requested_callback:true},matched_property_ids:[]} });
async function sync(conversation = 'conversation-a', id = contextId, data = result()) {
  return (await db.query<{ value: Record<string, unknown> }>('SELECT public.sync_rita_post_call($1,$2,$3::jsonb) AS value',[id,conversation,JSON.stringify(data)])).rows[0]?.value;
}
async function counts() {
  return (await db.query<{ leads:number;calls:number;messages:number }>('SELECT (SELECT count(*)::int FROM public.leads) AS leads,(SELECT count(*)::int FROM public.call_records) AS calls,(SELECT count(*)::int FROM public.messages) AS messages')).rows[0];
}
describe('Rita atomic card attachment', () => {
  it('replayed and concurrently queued deliveries create one lead, one call and one timeline event',async () => {
    const results=await Promise.all([sync(),sync(),sync()]);
    expect(results.map(item=>item?.['duplicate'])).toEqual([false,true,true]);
    expect(await counts()).toEqual({leads:1,calls:1,messages:1});
  });
  it.each(['050-0000099','+972500000099','00972500000099'])('matches the existing %s phone without creating a lead',async phone=>{
    await db.query('INSERT INTO public.leads(id,workspace_owner_id,full_name,phone_number,notes,lead_stage) VALUES($1,$2,$3,$4,$5,$6)',[leadId,owner,'שם שמור',phone,'הערה ידנית','closed']);
    expect((await sync())?.['lead_id']).toBe(leadId);
    const row=(await db.query<{full_name:string;notes:string;lead_stage:string}>('SELECT full_name,notes,lead_stage FROM public.leads')).rows[0];
    expect(row).toEqual({full_name:'שם שמור',notes:'הערה ידנית',lead_stage:'closed'});
    expect((await counts())?.leads).toBe(1);
  });
  it('lead_id takes precedence over a different phone match',async()=>{
    await db.exec(`INSERT INTO public.leads(id,workspace_owner_id,full_name,phone_number) VALUES('${leadId}','${owner}','שם שמור','0500000088'),(gen_random_uuid(),'${owner}','התאמת טלפון','0500000099'); UPDATE public.rita_call_contexts SET lead_id='${leadId}'`);
    expect((await sync())?.['lead_id']).toBe(leadId);
    expect((await counts())?.leads).toBe(2);
  });
  it('a same-phone lead in another workspace is never matched or updated',async()=>{
    await db.exec(`INSERT INTO public.leads(id,workspace_owner_id,phone_number,notes) VALUES('${leadId}','${other}','0500000099','פרטי')`);
    expect((await sync())?.['lead_id']).not.toBe(leadId);
    expect((await db.query<{notes:string}>('SELECT notes FROM public.leads WHERE id=$1',[leadId])).rows[0]?.notes).toBe('פרטי');
    expect((await counts())?.leads).toBe(2);
  });
  it('rejects a context lead belonging to another workspace and rolls back all writes',async()=>{
    await db.exec(`INSERT INTO public.leads(id,workspace_owner_id,phone_number) VALUES('${leadId}','${other}','0500000099'); UPDATE public.rita_call_contexts SET lead_id='${leadId}'`);
    await expect(sync()).rejects.toThrow('Lead workspace mismatch');
    expect(await counts()).toEqual({leads:1,calls:0,messages:0});
  });
  it.each(['broker_support','broker_invite'])('attaches %s to the existing profile instead of a buyer lead',async role=>{
    await db.query('UPDATE public.rita_call_contexts SET dynamic_variables=$1::jsonb',[JSON.stringify({call_role:role})]);
    const saved=await sync();
    expect(saved?.['profile_id']).toBe(owner);expect(saved?.['lead_id']).toBeNull();
    expect(await counts()).toEqual({leads:0,calls:1,messages:0});
  });
  it('an unrecognized inbound caller creates one lead only in the verified workspace',async()=>{
    await db.exec(`UPDATE public.rita_call_contexts SET dynamic_variables='{"call_role":"general_inbound"}'`);
    expect((await sync())?.['lead_id']).toBeTruthy();
    expect((await db.query<{workspace_owner_id:string}>('SELECT workspace_owner_id FROM public.leads')).rows[0]?.workspace_owner_id).toBe(owner);
  });
  it('a general call from the workspace owner attaches to their profile, not a new lead',async()=>{
    await db.exec(`UPDATE public.rita_call_contexts SET dynamic_variables='{"call_role":"general_inbound"}',lead_phone='050-0000034'`);
    expect((await sync())?.['profile_id']).toBe(owner);
    expect((await counts())?.leads).toBe(0);
  });
  it('an unassigned inbound caller stays in its saved context instead of guessing a workspace',async()=>{
    await db.exec('UPDATE public.rita_call_contexts SET workspace_owner_id=NULL');
    expect((await sync())?.['unassigned']).toBe(true);
    expect(await counts()).toEqual({leads:0,calls:0,messages:0});
  });
  it('a delayed older webhook cannot overwrite the newer card summary or interaction time',async()=>{
    await sync();
    const second='00000000-0000-0000-0000-000000000038';
    await db.exec(`INSERT INTO public.rita_call_contexts SELECT '${second}',workspace_owner_id,lead_id,property_id,direction,full_name,lead_phone,source,property_context,dynamic_variables,NULL,'conversation-b',status,qualification,matched_property_ids,transcript_summary,created_at,updated_at FROM public.rita_call_contexts WHERE id='${contextId}'`);
    await sync('conversation-b',second,result('2026-11-27T09:00:00Z'));
    const row=(await db.query<{conversation:string;last_interaction_at:string}>(`SELECT preferences#>>'{rita_last_call,conversation_id}' AS conversation,last_interaction_at::text FROM public.leads`)).rows[0];
    expect(row?.conversation).toBe('conversation-a');expect(row?.last_interaction_at).toContain('2026-11-28');
    expect((await counts())?.calls).toBe(2);
  });
  it('ordinary authenticated callers cannot invoke the service-only sync',async()=>{
    expect((await db.query<{allowed:boolean}>(`SELECT has_function_privilege('authenticated','public.sync_rita_post_call(uuid,text,jsonb)','EXECUTE') AS allowed`)).rows[0]?.allowed).toBe(false);
  });
  it('stores suggested property identifiers as the real context uuid array',async()=>{
    const property='00000000-0000-0000-0000-000000000039';
    const data={...result(),matched_property_ids:[property]};
    await db.query('SELECT public.sync_rita_post_call($1,$2,$3::jsonb)',[contextId,'conversation-a',JSON.stringify(data)]);
    expect((await db.query<{matched_property_ids:string[]}>('SELECT matched_property_ids FROM public.rita_call_contexts')).rows[0]?.matched_property_ids).toEqual([property]);
  });
  it('latest profile summaries obey the existing call-record RLS, including signed-out denial',async()=>{
    await db.exec(`UPDATE public.rita_call_contexts SET dynamic_variables='{"call_role":"broker_support"}'`);await sync();
    await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid','${other}',false)`);
    expect((await db.query<{value:unknown}>('SELECT public.rita_latest_profile_calls() AS value')).rows[0]?.value).toEqual([]);
    await db.exec(`SELECT set_config('test.uid','${owner}',false)`);
    const list=(await db.query<{value:Array<{user_id:string}>}>('SELECT public.rita_latest_profile_calls() AS value')).rows[0]?.value;
    expect(list?.map(item=>item.user_id)).toEqual([owner]);
    await db.exec('RESET ROLE');
    expect((await db.query<{allowed:boolean}>(`SELECT has_function_privilege('anon','public.rita_latest_profile_calls()','EXECUTE') AS allowed`)).rows[0]?.allowed).toBe(false);
  });
});