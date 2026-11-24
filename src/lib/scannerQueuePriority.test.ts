import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db = new PGlite();
const actor = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-000000000010';
const last = '00000000-0000-4000-8000-000000000020';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.role',true),'service_role') $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${actor}'::uuid $$;
    CREATE TABLE public.demo_view_accounts(user_id uuid);
    CREATE TABLE public.broker_wa_scanner_settings(id boolean,day_attempts int,daily_cap int,next_send_at timestamptz);
    INSERT INTO public.broker_wa_scanner_settings VALUES(true,15,15,'2026-11-24T06:00:00Z');
    CREATE TABLE public.broker_whatsapp_contacts(broker_id uuid);
    CREATE TABLE public.broker_wa_scanner_jobs(id uuid PRIMARY KEY,broker_id uuid,listing_id uuid,created_by uuid,source_url text,status text,created_at timestamptz,updated_at timestamptz);
    CREATE TABLE public.audit_logs(actor_id uuid,action text,target_table text,target_id text,details jsonb);
    CREATE FUNCTION public.scanner_broker_eligible(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.claim_broker_wa_scanner_source() RETURNS SETOF public.broker_wa_scanner_jobs LANGUAGE sql AS $$ SELECT * FROM public.broker_wa_scanner_jobs WHERE status='pending_source' ORDER BY created_at,id LIMIT 1 $$;
    CREATE FUNCTION public.reserve_broker_wa_scanner_send(text,text,integer) RETURNS SETOF public.broker_wa_scanner_jobs LANGUAGE sql AS $$ SELECT * FROM public.broker_wa_scanner_jobs WHERE status='ready' ORDER BY created_at,id LIMIT 1 $$;
    INSERT INTO public.broker_wa_scanner_jobs VALUES('${first}','${first}','${first}','${actor}','source','ready','2026-11-24T00:00:00Z',now()),('${last}','${last}','${last}','${actor}','source','ready','2026-11-24T01:00:00Z',now());`);
  await db.exec(readFileSync('drizzle/migrations/0284_scanner_queue_priority.sql','utf8'));
}, 30000);
afterAll(async () => db.close());
it('promotes a waiting job ahead of older jobs without changing dates, quota or pacing', async () => {
  expect((await db.query<{ok:boolean}>(`SELECT public.promote_broker_wa_scanner_job('${last}','${actor}') AS ok`)).rows[0]?.ok).toBe(true);
  expect((await db.query<{id:string}>(`SELECT id FROM public.reserve_broker_wa_scanner_send('','',45)`)).rows[0]?.id).toBe(last);
  expect((await db.query<{created_at:Date}>(`SELECT created_at FROM public.broker_wa_scanner_jobs WHERE id='${last}'`)).rows[0]?.created_at.toISOString()).toBe('2026-11-24T01:00:00.000Z');
  const settings = (await db.query<{day_attempts:number;daily_cap:number;next_send_at:Date}>('SELECT * FROM public.broker_wa_scanner_settings')).rows[0];
  expect(settings?.day_attempts).toBe(15); expect(settings?.daily_cap).toBe(15); expect(settings?.next_send_at.toISOString()).toBe('2026-11-24T06:00:00.000Z');
});
it('cannot move a sending or awaiting-reply job', async () => {
  for (const status of ['sending','awaiting_reply']) {
    await db.query(`UPDATE public.broker_wa_scanner_jobs SET status=$1 WHERE id=$2`,[status, first]);
    expect((await db.query<{ok:boolean}>(`SELECT public.promote_broker_wa_scanner_job('${first}','${actor}') AS ok`)).rows[0]?.ok).toBe(false);
  }
});
it('uses the same promoted ordering when reading pending ads', async () => {
  await db.exec(`UPDATE public.broker_wa_scanner_jobs SET status='pending_source';`);
  expect((await db.query<{id:string}>(`SELECT id FROM public.claim_broker_wa_scanner_source()`)).rows[0]?.id).toBe(last);
});
it('rejects a non-Super-Admin actor', async () => { await expect(db.query(`SELECT public.promote_broker_wa_scanner_job('${last}','${first}')`)).rejects.toThrow('forbidden'); });