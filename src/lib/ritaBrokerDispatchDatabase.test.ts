import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const id = '00000000-0000-0000-0000-000000000034';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.broker_outreach_journeys (broker_id uuid PRIMARY KEY, enabled boolean, call_consent_at timestamptz, interested_at timestamptz, opted_out_at timestamptz, cancel_requested_at timestamptz, otp_verified_phone text, call_due_at timestamptz, call_status text, call_provider_id text, last_error text);`);
  await db.exec(readFileSync(new URL('../../drizzle/migrations/0324_rita_broker_demo_dispatch.sql', import.meta.url), 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec(`DELETE FROM public.broker_outreach_journeys;
    INSERT INTO public.broker_outreach_journeys(broker_id,enabled,call_consent_at,interested_at,otp_verified_phone,call_due_at,call_status)
    VALUES('${id}',true,now(),now(),'972500000034',now()+interval '60 seconds','ready_to_schedule');`);
});
afterAll(async () => { await db.close(); });
async function value(sql: string) { return (await db.query<{ value: unknown }>(sql)).rows[0]?.value; }
describe('durable Rita invitation rules', () => {
  it('queues only ElevenLabs while preserving the original 60-second due time', async () => {
    expect(await value(`SELECT public.arm_rita_broker_demo('${id}') AS value`)).toBe(true);
    const row = (await db.query<{ call_provider: string; remaining: number }>(`SELECT call_provider, round(extract(epoch FROM call_due_at-now()))::int AS remaining FROM public.broker_outreach_journeys`)).rows[0];
    expect(row?.call_provider).toBe('elevenlabs'); expect(row?.remaining).toBe(60);
    expect(await value(`SELECT public.claim_rita_broker_demo('${id}') AS value`)).toBeNull();
  });
  it('does not queue a broker without recorded call consent', async () => {
    await db.exec('UPDATE public.broker_outreach_journeys SET call_consent_at=NULL');
    expect(await value(`SELECT public.arm_rita_broker_demo('${id}') AS value`)).toBe(false);
  });
  it('claims a due call exactly once', async () => {
    await value(`SELECT public.arm_rita_broker_demo('${id}') AS value`);
    await db.exec("UPDATE public.broker_outreach_journeys SET call_due_at=now()-interval '1 second'");
    expect(await value(`SELECT public.claim_rita_broker_demo('${id}') AS value`)).toMatchObject({ otp_verified_phone: '972500000034' });
    expect(await value(`SELECT public.claim_rita_broker_demo('${id}') AS value`)).toBeNull();
  });
  it('cancels during the wait and never claims the cancelled call', async () => {
    await value(`SELECT public.arm_rita_broker_demo('${id}') AS value`);
    expect(await value(`SELECT public.cancel_rita_broker_demo('${id}') AS value`)).toBe(true);
    await db.exec("UPDATE public.broker_outreach_journeys SET call_due_at=now()-interval '1 second'");
    expect(await value(`SELECT public.claim_rita_broker_demo('${id}') AS value`)).toBeNull();
  });
  it('expires late calls instead of sending them', async () => {
    await value(`SELECT public.arm_rita_broker_demo('${id}') AS value`);
    await db.exec("UPDATE public.broker_outreach_journeys SET call_due_at=now()-interval '91 seconds'");
    expect(await value(`SELECT public.claim_rita_broker_demo('${id}') AS value`)).toBeNull();
    expect(await value('SELECT call_status AS value FROM public.broker_outreach_journeys')).toBe('blocked');
  });
  it('keeps scheduling RPCs unavailable to ordinary signed-in users', async () => {
    expect(await value("SELECT has_function_privilege('authenticated','public.claim_rita_broker_demo(uuid)','EXECUTE') AS value")).toBe(false);
    expect(await value("SELECT has_function_privilege('service_role','public.claim_rita_broker_demo(uuid)','EXECUTE') AS value")).toBe(true);
  });
});
