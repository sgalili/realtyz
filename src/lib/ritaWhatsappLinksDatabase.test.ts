import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const context = '00000000-0000-0000-0000-000000000002';
const owner = '00000000-0000-0000-0000-000000000003';
const send = '00000000-0000-0000-0000-000000000004';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.rita_call_contexts(id uuid PRIMARY KEY, lead_phone text, lead_id uuid,workspace_owner_id uuid);
    CREATE TABLE public.leads(id uuid PRIMARY KEY,workspace_owner_id uuid);
    CREATE TABLE public.messages(id uuid PRIMARY KEY,lead_id uuid,platform text,direction text,created_at timestamptz);
    INSERT INTO public.rita_call_contexts VALUES ('${context}','+972501234567',NULL,'${owner}');`);
  await db.exec(readFileSync('drizzle/migrations/0329_rita_confirmed_whatsapp_links.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0330_rita_whatsapp_verified_service_window.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE public.rita_whatsapp_status_inbox,public.rita_whatsapp_link_sends;
    INSERT INTO public.rita_whatsapp_link_sends(id,context_id,workspace_owner_id,dedupe_key,property_ids,phone_number,message) VALUES ('${send}','${context}','${owner}','same-request','{}','972501234567','test');`);
});
function event(state: string, timestamp = 1795875000) { return { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid-test', status: state, timestamp: String(timestamp), errors: state === 'failed' ? [{ code: 131047 }] : [] }] } }] }] }; }
async function receipt(delivery: string, payload: unknown) { return db.query('SELECT public.record_rita_whatsapp_status($1,$2::jsonb)', [delivery, JSON.stringify(payload)]); }
async function finish() { return db.query('SELECT public.finish_rita_whatsapp_links($1,$2,$3)', [send, 'accepted', 'wamid-test']); }
describe('durable WhatsApp link outcomes', () => {
  it('keeps early status pending, then reconciles after saving the provider ID', async () => {
    await receipt('early', event('delivered')); await finish();
    expect((await db.query<{status: string}>('SELECT status FROM public.rita_whatsapp_link_sends')).rows[0]?.status).toBe('delivered');
    expect((await db.query<{done:boolean}>('SELECT processed_at IS NOT NULL AS done FROM public.rita_whatsapp_status_inbox')).rows[0]?.done).toBe(true);
  });
  it('never downgrades read to an older sent receipt, preserves event timestamps and deduplicates deliveries', async () => {
    await finish(); await receipt('read', event('read')); await receipt('sent', event('sent', 1795874000)); await receipt('read', event('read'));
    const row=(await db.query<{status:string;status_history:Array<{provider_timestamp:string}>}>('SELECT status,status_history FROM public.rita_whatsapp_link_sends')).rows[0];
    expect(row?.status).toBe('read'); expect(row?.status_history.length).toBe(2);
    expect(new Date(row?.status_history[0]?.provider_timestamp ?? '').getTime()).toBe(1795875000*1000);
  });
  it('blocks duplicate claims instead of submitting another message', async () => {
    await expect(db.exec(`INSERT INTO public.rita_whatsapp_link_sends(context_id,workspace_owner_id,dedupe_key,property_ids,phone_number,message) VALUES ('${context}','${owner}','same-request','{}','972501234567','duplicate')`)).rejects.toThrow('unique');
  });
  it('does not grant ordinary users access to inbox, sends or privileged functions', async () => {
    const row=(await db.query<{table_access:boolean;function_access:boolean}>(`SELECT has_table_privilege('authenticated','public.rita_whatsapp_link_sends','SELECT') AS table_access,has_function_privilege('anon','public.finish_rita_whatsapp_links(uuid,text,text,text)','EXECUTE') AS function_access`)).rows[0];
    expect(row?.table_access).toBe(false); expect(row?.function_access).toBe(false);
  });
  it('requires actual WhatsApp inbound evidence, not phone-call consent', async () => {
    expect((await db.query<{allowed:boolean}>('SELECT public.rita_whatsapp_service_window($1,$2) AS allowed',['972501234567',context])).rows[0]?.allowed).toBe(false);
    await receipt('inbound', {entry:[{changes:[{value:{messages:[{from:'972501234567',timestamp:String(Math.floor(Date.now()/1000)),text:{body:'hello'}}]}}]}]});
    expect((await db.query<{allowed:boolean}>('SELECT public.rita_whatsapp_service_window($1,$2) AS allowed',['972501234567',context])).rows[0]?.allowed).toBe(true);
  });
});