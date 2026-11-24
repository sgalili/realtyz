import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db=new PGlite();
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=uid(1), red=uid(2), green=uid(3), developer=uid(4), logged=uid(5);
let registryId='',token='',discoveryId='';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA net; CREATE SCHEMA cron;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'service_role') $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,last_sign_in_at timestamptz);
 CREATE TABLE public.user_roles(user_id uuid,role text);
 CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT exists(select 1 from public.user_roles where user_id=$1 and role=$2) $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,city text,locked_broker_city text,broker_license_number text,locked_broker_name text);
 CREATE TABLE public.demo_view_accounts(user_id uuid);
 CREATE TABLE public.admin_broker_onboarding(user_id uuid PRIMARY KEY,import_source text,imported_license_number text,first_invitation_at timestamptz,first_login_at timestamptz);
 CREATE TABLE public.admin_approved_broker_licenses(user_id uuid PRIMARY KEY,license_number text);
 CREATE TABLE public.broker_license_verifications(user_id uuid PRIMARY KEY,license_number text,registry_holder_name text,account_name_before_verification text,source_url text,source_updated_at timestamptz,verified_at timestamptz);
 CREATE TABLE public.official_brokers_registry(license_number text PRIMARY KEY,holder_name text,display_name text,registry_city text,source_url text,source_updated_at timestamptz,checked_at timestamptz);
 CREATE TABLE public.audit_logs(actor_id uuid,action text,target_table text,target_id text,details jsonb);
 CREATE TABLE public.broker_whatsapp_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid,status text DEFAULT 'running',enqueue_finished boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.broker_whatsapp_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),broker_id uuid,workspace_owner_id uuid,listing_id uuid,source_url text,created_by uuid,batch_id uuid,status text DEFAULT 'pending',last_error text,lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.broker_wa_scanner_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),broker_id uuid,workspace_owner_id uuid,listing_id uuid,source_url text,created_by uuid,status text DEFAULT 'pending_source',last_error text,lease_token uuid,lease_until timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.broker_whatsapp_contacts(broker_id uuid PRIMARY KEY,whatsapp_phone text);
 CREATE TABLE public.broker_wa_scanner_settings(id boolean,enabled boolean,paused boolean,day_attempts int,daily_cap int);
 INSERT INTO public.broker_wa_scanner_settings VALUES(true,true,false,3,15);
 CREATE TABLE public.listings(id uuid PRIMARY KEY,user_id uuid,workspace_owner_id uuid,source text,source_url text,created_at timestamptz DEFAULT now());
 CREATE TABLE cron.job(jobid serial,jobname text PRIMARY KEY,schedule text,command text);
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule RETURNING jobid INTO n; RETURN n; END $$;
 CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN DELETE FROM cron.job WHERE jobname=$1; RETURN FOUND; END $$;
 CREATE TABLE net.requests(id serial,url text,body jsonb);
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN INSERT INTO net.requests(url,body) VALUES($1,$3) RETURNING id INTO n; RETURN n; END $$;
 CREATE FUNCTION public.internal_call_headers() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
 INSERT INTO public.user_roles VALUES('${actor}','super_admin'),('${developer}','developer');
 INSERT INTO public.profiles(id,full_name) VALUES('${actor}','Admin'),('${red}','Original'),('${green}','Verified'),('${developer}','Developer'),('${logged}','Logged');
 INSERT INTO public.admin_broker_onboarding(user_id,import_source,imported_license_number) VALUES('${red}','yad2','123'),('${green}','yad2','456'),('${developer}','yad2','789'),('${logged}','yad2','111');
 INSERT INTO public.broker_license_verifications(user_id,license_number,verified_at) VALUES('${green}','456',now());
 INSERT INTO auth.users(id,last_sign_in_at) VALUES('${logged}',now());`);
 await db.exec(readFileSync('drizzle/migrations/0285_durable_broker_scanner_registry_batches.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0286_registry_source_timestamp_casts.sql','utf8'));
},30000);
afterAll(async()=>db.close());
it('queues only the complete red waiting broker set and wakes it without a browser',async()=>{
 registryId=(await db.query<{id:string}>(`select public.start_broker_registry_batch($1,$2::uuid[]) id`,[actor,[red,green,developer,logged]])).rows[0].id;
 expect((await db.query<{broker_id:string}>('select broker_id from public.broker_registry_batch_items')).rows.map(r=>r.broker_id)).toEqual([red]);
 expect((await db.query<{n:number}>('select count(*)::int n from net.requests')).rows[0].n).toBe(1);
 expect((await db.query<{n:number}>('select count(*)::int n from cron.job')).rows[0].n).toBe(1);
});
it('claims serially and rejects a second concurrent execution',async()=>{
 token=(await db.query<{lease_token:string}>('select lease_token from public.claim_broker_registry_batch($1)',[registryId])).rows[0].lease_token;
 expect((await db.query('select * from public.claim_broker_registry_batch($1)',[registryId])).rows).toHaveLength(0);
});
it('survives logout while protecting status and preserving the exact saved registry identity',async()=>{
 await db.exec("select set_config('test.role','authenticated',false);select set_config('test.uid','',false)");
 await expect(db.query('select public.get_broker_registry_batch($1)',[registryId])).rejects.toThrow('forbidden');
 await db.exec("select set_config('test.role','service_role',false)");
 const result=await db.query<{profile:any}>(`select public.save_admin_registry_match($1,$2,'123','Exact Name','Exact Name','City','https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6','2026-11-24T00:00:00Z',$3,$4) profile`,[actor,red,registryId,token]);
 expect(result.rows[0].profile).toMatchObject({id:red,full_name:'Exact Name',broker_license_number:'123'});
 const item=(await db.query<{id:string}>('select id from public.broker_registry_batch_items where batch_id=$1',[registryId])).rows[0];
 await db.query("select public.finish_broker_registry_item($1,$2,$3,'verified',false)",[registryId,token,item.id]);await db.query('select public.release_broker_registry_batch($1,$2)',[registryId,token]);
 expect((await db.query<{batch:any}>('select public.get_broker_registry_batch($1) batch',[registryId])).rows[0].batch).toMatchObject({status:'completed',done:1,total:1,verified:1});
 expect((await db.query('select * from cron.job')).rows).toHaveLength(0);
});
it('rejects borrowed licenses without changing any verified profile',async()=>{
 await expect(db.query(`select public.save_admin_registry_match($1,$2,'456','Verified','Verified','','https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6','2026-11-24',null,null)`,[actor,red])).rejects.toThrow('license_changed');
 expect((await db.query<{full_name:string}>('select full_name from public.profiles where id=$1',[red])).rows[0].full_name).toBe('Exact Name');
});
it('blocks late registry writes after explicit Super Admin cancellation',async()=>{
 const pending=uid(6);await db.query("insert into public.profiles(id,full_name) values($1,'Unchanged')",[pending]);await db.query("insert into public.admin_broker_onboarding(user_id,import_source,imported_license_number) values($1,'yad2','222')",[pending]);
 const id=(await db.query<{id:string}>('select public.start_broker_registry_batch($1,$2::uuid[]) id',[actor,[pending]])).rows[0].id;
 const t=(await db.query<{lease_token:string}>('select lease_token from public.claim_broker_registry_batch($1)',[id])).rows[0].lease_token;
 await db.query('select public.cancel_broker_registry_batch($1,$2)',[id,actor]);
 await expect(db.query(`select public.save_admin_registry_match($1,$2,'222','New Name','New Name','','https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6','2026-11-24',$3,$4)`,[actor,pending,id,t])).rejects.toThrow('cancelled_or_stale_batch');
 expect((await db.query<{full_name:string}>('select full_name from public.profiles where id=$1',[pending])).rows[0].full_name).toBe('Unchanged');expect((await db.query('select * from cron.job')).rows).toHaveLength(0);
});
it('stores all 25 selected discovery targets atomically beyond the old browser page limit',async()=>{
 const targets=Array.from({length:25},(_,i)=>uid(100+i));for(const id of targets){await db.query("insert into public.profiles(id) values($1)",[id]);await db.query("insert into public.admin_broker_onboarding(user_id,import_source,imported_license_number) values($1,'yad2','333')",[id]);await db.query("insert into public.listings(id,user_id,workspace_owner_id,source,source_url) values($1,$1,$1,'yad2','https://www.yad2.co.il/realestate/item/test')",[id]);}
 discoveryId=(await db.query<{id:string}>('select public.start_selected_broker_whatsapp_batch($1,$2::uuid[]) id',[actor,targets])).rows[0].id;
 expect((await db.query('select * from public.broker_whatsapp_jobs where batch_id=$1',[discoveryId])).rows).toHaveLength(25);
 expect((await db.query<{enqueue_finished:boolean}>('select enqueue_finished from public.broker_whatsapp_batches where id=$1',[discoveryId])).rows[0].enqueue_finished).toBe(true);
 expect((await db.query<{id:string}>('select public.start_selected_broker_whatsapp_batch($1,$2::uuid[]) id',[actor,targets])).rows[0].id).toBe(discoveryId);
});
it('keeps not-found source work pending until its saved scanner continuation completes',async()=>{
 const broker=uid(101);await db.query("update public.broker_whatsapp_jobs set status='not_found' where broker_id=$1",[broker]);
 expect((await db.query<{broker_id:string}>('select broker_id from public.pending_broker_scanner_continuations()')).rows.map(r=>r.broker_id)).toContain(broker);
 expect((await db.query<{p:any}>('select public.get_broker_whatsapp_batch_progress($1) p',[discoveryId])).rows[0].p).toMatchObject({status:'running',done:0,total:25});
 await db.query("insert into public.broker_wa_scanner_jobs(broker_id,workspace_owner_id,listing_id,source_url,created_by,batch_id) values($1,$1,$1,'https://www.yad2.co.il/realestate/item/test',$2,$3)",[broker,actor,discoveryId]);
 expect((await db.query('select * from public.pending_broker_scanner_continuations()')).rows).toHaveLength(0);
});
it('cancels both stages while preserving completed results and the 3/15 quota',async()=>{
 await db.query("update public.broker_whatsapp_jobs set status='completed' where broker_id=$1",[uid(100)]);await db.query('select public.cancel_broker_whatsapp_batch($1,$2)',[discoveryId,actor]);
 expect((await db.query<{status:string}>('select status from public.broker_whatsapp_jobs where broker_id=$1',[uid(100)])).rows[0].status).toBe('completed');
 expect((await db.query<{status:string}>('select status from public.broker_wa_scanner_jobs where batch_id=$1',[discoveryId])).rows[0].status).toBe('cancelled');
 expect((await db.query('select * from public.broker_wa_scanner_settings')).rows[0]).toMatchObject({day_attempts:3,daily_cap:15});
});
it('exposes neither operational queue mutations nor status to anonymous users',async()=>{
 expect((await db.query<{ok:boolean}>("select has_function_privilege('anon','public.start_broker_registry_batch(uuid,uuid[])','execute') ok")).rows[0].ok).toBe(false);
 await db.exec("select set_config('test.role','anon',false)");await expect(db.query('select public.get_broker_discovery_overview()')).rejects.toThrow('forbidden');await db.exec("select set_config('test.role','service_role',false)");
});