import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
const token1 = '00000000-0000-0000-0000-000000000001';
const token2 = '00000000-0000-0000-0000-000000000002';
const developer = '00000000-0000-0000-0000-000000000003';
const workspace = '00000000-0000-0000-0000-000000000004';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role',true)$$;
    CREATE TABLE developers(id uuid PRIMARY KEY,workspace_owner_id uuid);
    SET test.role='service_role';`);
  await db.exec(readFileSync('drizzle/migrations/0232_developer_import_identity_claims.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
it('serializes same-company provisioning and returns the saved account on subsequent imports', async () => {
  const claim = async (token: string) => (await db.query<{ result: { busy: boolean; developer_id?: string } }>('SELECT claim_developer_import_identity($1,$2) AS result', ['קרסונדלן', token])).rows[0]?.result;
  expect((await claim(token1))?.busy).toBe(false);
  expect((await claim(token2))?.busy).toBe(true);
  await db.query('INSERT INTO developers VALUES($1,$2)', [developer, workspace]);
  await expect(db.query('SELECT finish_developer_import_identity($1,$2,$3,$4)', ['קרסונדלן', token1, developer, token2])).rejects.toThrow('identity_unavailable');
  await db.query('SELECT finish_developer_import_identity($1,$2,$3,$4)', ['קרסונדלן', token1, developer, workspace]);
  expect(await claim(token2)).toMatchObject({ busy: false, developer_id: developer });
});