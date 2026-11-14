import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE fb_user_groups(id uuid DEFAULT gen_random_uuid(), workspace_owner_id uuid,group_id text,group_name text,is_blocked boolean DEFAULT false,is_selected boolean DEFAULT true,join_status text DEFAULT 'joined',max_posts_per_day int,cooldown_until timestamptz);
    CREATE TABLE campaign_activity_queue(id uuid DEFAULT gen_random_uuid(),workspace_owner_id uuid,activity_type text DEFAULT 'fb_group_post',status text DEFAULT 'pending',target_ref text,runner text DEFAULT 'cloud',scheduled_for timestamptz DEFAULT now(),completed_at timestamptz,publication_status text,payload jsonb DEFAULT '{}');
    CREATE TABLE fb_group_post_log(workspace_owner_id uuid,group_id text,posted_on date,post_count int);
    CREATE TABLE fb_account_post_attempts(workspace_owner_id uuid,page_id text,attempted_at timestamptz);
    CREATE TABLE notifications(user_id uuid,event_type text,title text,body text,deep_link text,channel text,delivery_result jsonb);
    CREATE FUNCTION fb_group_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT $1';
    CREATE FUNCTION fb_job_page_id(campaign_activity_queue) RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce($1.payload->>'page_id','page') $$;
  `);
  await db.exec(readFileSync('drizzle/migrations/0178_distribution_capacity_queue.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0179_distribution_background_monitor.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0180_count_completed_distribution_jobs.sql', 'utf8'));
}, 30000);
beforeEach(async () => {
  await db.exec('TRUNCATE fb_user_groups,campaign_activity_queue,fb_group_post_log,fb_account_post_attempts,notifications;');
  await db.query(`INSERT INTO fb_user_groups(workspace_owner_id,group_id,group_name,max_posts_per_day) VALUES($1,'group','Test group',2)`, [owner]);
});
afterAll(async () => { await db.close(); });
async function add(count: number, ws = owner) {
  for (let i = 0; i < count; i++) await db.query(`INSERT INTO campaign_activity_queue(workspace_owner_id,target_ref,scheduled_for,payload) VALUES($1,'group',((now() AT TIME ZONE 'Asia/Jerusalem')::date+1+time '09:00') AT TIME ZONE 'Asia/Jerusalem','{"job":{}}')`, [ws]);
}
describe('database distribution reservations', () => {
  it('queues five assets across three days with at most two per day', async () => {
    await add(5);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int n FROM campaign_activity_queue GROUP BY (scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date ORDER BY min(scheduled_for)`);
    expect(rows.map(r => r.n)).toEqual([2, 2, 1]);
  });
  it('leaves a seven-minute sequential gap within available slots', async () => {
    await add(2);
    const { rows } = await db.query<{ gap: number }>('SELECT extract(epoch from max(scheduled_for)-min(scheduled_for))::int gap FROM campaign_activity_queue');
    expect(rows[0]?.gap).toBe(420);
  });
  it('counts already consumed daily quota before reserving new slots', async () => {
    await db.query(`INSERT INTO fb_group_post_log VALUES($1,'group',(now() AT TIME ZONE 'Asia/Jerusalem')::date+1,2)`, [owner]);
    await add(1);
    const { rows } = await db.query<{ days: number }>(`SELECT (scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date-(now() AT TIME ZONE 'Asia/Jerusalem')::date days FROM campaign_activity_queue`);
    expect(rows[0]?.days).toBe(2);
  });
  it('counts completed cloud posts even without legacy group counters', async () => {
    await db.query(`INSERT INTO campaign_activity_queue(workspace_owner_id,target_ref,status,completed_at,scheduled_for) SELECT $1,'group','completed',((now() AT TIME ZONE 'Asia/Jerusalem')::date+1+time '09:00') AT TIME ZONE 'Asia/Jerusalem',((now() AT TIME ZONE 'Asia/Jerusalem')::date+1+time '09:00') AT TIME ZONE 'Asia/Jerusalem' FROM generate_series(1,2)`, [owner]);
    await add(1);
    const { rows } = await db.query<{ days: number }>(`SELECT (scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date-(now() AT TIME ZONE 'Asia/Jerusalem')::date days FROM campaign_activity_queue WHERE status='pending'`);
    expect(rows[0]?.days).toBe(2);
  });
  it('sends one in-app advisory only when backlog exceeds one day', async () => {
    await add(2);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
    await add(3);
    const { rows } = await db.query<{ channel: string; delivery_result: { backlog: number } }>('SELECT * FROM notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe('in_app');
    expect(rows[0]?.delivery_result.backlog).toBe(3);
  });
  it('keeps another workspace outside the capacity and notification counts', async () => {
    await add(4, '00000000-0000-0000-0000-000000000002');
    await add(2);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
    const { rows } = await db.query<{ n: number }>('SELECT count(distinct scheduled_for)::int n FROM campaign_activity_queue WHERE workspace_owner_id=$1', [owner]);
    expect(rows[0]?.n).toBe(2);
  });
  it('does not reserve blocked channels or send expansion advice for them', async () => {
    await db.exec('UPDATE fb_user_groups SET is_blocked=true');
    await add(3);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM campaign_activity_queue WHERE payload->>'distribution_queue'='true'")).rows).toHaveLength(0);
  });
  it('honors the 35-post page cap without consuming remaining account quota', async () => {
    await db.query(`INSERT INTO fb_account_post_attempts SELECT $1,'page',((now() AT TIME ZONE 'Asia/Jerusalem')::date+1+time '09:00') AT TIME ZONE 'Asia/Jerusalem' FROM generate_series(1,35)`, [owner]);
    await add(1);
    const { rows } = await db.query<{ days: number }>(`SELECT (scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date-(now() AT TIME ZONE 'Asia/Jerusalem')::date days FROM campaign_activity_queue`);
    expect(rows[0]?.days).toBe(2);
  });
  it('honors the 100-post account limit even on another page', async () => {
    await db.query(`INSERT INTO fb_account_post_attempts SELECT $1,'other-page',((now() AT TIME ZONE 'Asia/Jerusalem')::date+1+time '09:00') AT TIME ZONE 'Asia/Jerusalem' FROM generate_series(1,100)`, [owner]);
    await add(1);
    const { rows } = await db.query<{ days: number }>(`SELECT (scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date-(now() AT TIME ZONE 'Asia/Jerusalem')::date days FROM campaign_activity_queue`);
    expect(rows[0]?.days).toBe(2);
  });
  it('background checks preserve durable jobs and respect refreshed quota', async () => {
    await db.query(`INSERT INTO fb_group_post_log VALUES($1,'group',(now() AT TIME ZONE 'Asia/Jerusalem')::date,2)`, [owner]);
    await db.query(`INSERT INTO campaign_activity_queue(workspace_owner_id,target_ref,scheduled_for,status) VALUES($1,'group',now()-interval '1 hour','processing')`, [owner]);
    await db.exec("UPDATE campaign_activity_queue SET status='pending'; SELECT monitor_distribution_queue();");
    const { rows } = await db.query<{ days: number }>(`SELECT (scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date-(now() AT TIME ZONE 'Asia/Jerusalem')::date days FROM campaign_activity_queue`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.days).toBe(1);
  });
});