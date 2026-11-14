import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const broker = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;
    CREATE FUNCTION ws_current_access(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${owner}'::uuid $$;
    CREATE FUNCTION is_community_chat_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('${owner}'::uuid,'${broker}'::uuid) $$;
    CREATE TABLE profiles(id uuid,broker_license_number text); CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE white_label_settings(user_id uuid,brokerage_name text,agency_name text);
    CREATE TABLE listings(id uuid,workspace_owner_id uuid,user_id uuid,source text,source_metadata jsonb,is_published boolean,status text,affiliate_enabled boolean,distribution_paused boolean);
    INSERT INTO profiles VALUES('${broker}','12345'); INSERT INTO user_roles VALUES('${broker}','agent');
    INSERT INTO white_label_settings VALUES('${broker}','Office','Office');
    INSERT INTO listings VALUES('${owner}','${owner}','${owner}','manual','{}',true,'live',true,false);
    INSERT INTO listings VALUES('${broker}','${owner}','${owner}','yad2','{"broker_license_number":"12345","office_name":"Office","broker_license_evidence":{"source":"source_ad","number":"12345","source_url":"https://www.yad2.co.il/realestate/item/abc"}}',true,'live',true,false);`);
  await db.exec(readFileSync('drizzle/migrations/0181_listing_public_profile_targets.sql','utf8'));
},30000);
afterAll(async () => { await db.close(); });
describe('authorized original publisher links', () => {
  it('links manual publishers to their saved account', async () => {
    const { rows } = await db.query('SELECT profile_user_id FROM get_listing_profile_targets(ARRAY[$1::uuid])',[owner]);
    expect(rows).toEqual([{profile_user_id:owner}]);
  });
  it('links source-verified licenses to the original broker, never the importer', async () => {
    const { rows } = await db.query('SELECT profile_user_id,office_user_id FROM get_listing_profile_targets(ARRAY[$1::uuid])',[broker]);
    expect(rows).toEqual([{profile_user_id:broker,office_user_id:broker}]);
  });
  it('does not link unrelated private inaccessible listings', async () => {
    const id='00000000-0000-0000-0000-000000000003';
    await db.exec(`INSERT INTO listings VALUES('${id}','${broker}','${broker}','manual','{}',false,'draft',false,false)`);
    expect((await db.query('SELECT * FROM get_listing_profile_targets(ARRAY[$1::uuid])',[id])).rows).toEqual([]);
  });
  it('does not guess a broker from a name without source license evidence', async () => {
    await db.exec(`UPDATE listings SET source_metadata='{"broker_name":"Original broker","broker_license_number":"12345"}' WHERE id='${broker}'`);
    expect((await db.query('SELECT * FROM get_listing_profile_targets(ARRAY[$1::uuid])',[broker])).rows).toEqual([]);
  });
});