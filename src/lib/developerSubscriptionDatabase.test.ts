import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const buyer = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
    CREATE TABLE user_roles(user_id uuid NOT NULL,role text NOT NULL,UNIQUE(user_id,role));
    CREATE TABLE workspace_memberships(user_id uuid,workspace_owner_id uuid,account_type text);
    CREATE TABLE grow_payment_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,environment text NOT NULL,
      amount_ils numeric NOT NULL DEFAULT 6500,duration_days integer NOT NULL,title text NOT NULL,benefits text NOT NULL,
      status text NOT NULL DEFAULT 'pending',transaction_id text,payment_url text,created_at timestamptz NOT NULL DEFAULT now(),paid_at timestamptz,
      customer_phone text,payment_method text,card_mandate boolean NOT NULL DEFAULT false,mandate_at timestamptz,
      purpose text NOT NULL DEFAULT 'subscription' CONSTRAINT grow_payment_orders_purpose_check CHECK(purpose IN('subscription','wallet_topup')),
      workspace_owner_id uuid,wallet_bonus_percent numeric NOT NULL DEFAULT 0,wallet_bonus_ils numeric NOT NULL DEFAULT 0,wallet_credit_rate numeric,
      CONSTRAINT grow_order_amount_by_purpose CHECK((purpose='subscription' AND amount_ils=6500) OR (purpose='wallet_topup' AND amount_ils>0)),UNIQUE(environment,transaction_id)
    );
    CREATE TABLE grow_subscription_entitlements(order_id uuid PRIMARY KEY REFERENCES grow_payment_orders(id),user_id uuid NOT NULL,title text NOT NULL,benefits text NOT NULL,starts_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
    CREATE TABLE developers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid NOT NULL,commission_config jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE developer_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid NOT NULL,developer_id uuid,commission_config jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE listings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid NOT NULL,developer_project_id uuid,is_published boolean NOT NULL DEFAULT false);
    CREATE POLICY "ws access developer_projects" ON developer_projects FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY "Workspace members can insert developers" ON developers FOR INSERT TO authenticated WITH CHECK(true);
    CREATE POLICY "Workspace members can update developers" ON developers FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY "Workspace members can delete developers" ON developers FOR DELETE TO authenticated USING(true);
    CREATE FUNCTION add_credit(uuid,numeric,text,uuid,text) RETURNS void LANGUAGE sql AS $$SELECT 1$$;
    CREATE FUNCTION ensure_profile_row(uuid) RETURNS void LANGUAGE sql AS $$SELECT 1$$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)$$;
    CREATE FUNCTION current_workspace_owner() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.workspace',true),'')::uuid$$;
    CREATE FUNCTION ws_current_access(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1=current_workspace_owner()$$;
    CREATE FUNCTION developer_fees_valid(jsonb,text,numeric) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
  `);
  await db.exec(readFileSync('drizzle/migrations/0197_developer_paid_subscription_entitlements.sql', 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec(`TRUNCATE grow_payment_orders,grow_subscription_entitlements,user_roles,workspace_memberships,listings; SET test.uid='${buyer}'; SET test.workspace='${owner}';`);
});
afterAll(async () => { await db.close(); });

async function createOrder(environment = 'live') {
  const result = await db.query<{ id: string }>(`INSERT INTO grow_payment_orders(user_id,workspace_owner_id,environment,purpose,amount_ils,base_amount_ils,vat_amount_ils,duration_days,title,benefits,plan_code,terms_accepted_at) VALUES($1,$2,$3,'developer_subscription',11210,9500,1710,30,'מנוי יזמים TORAFF','benefits','developer_monthly',now()) RETURNING id`, [buyer, owner, environment]);
  return result.rows[0]!.id;
}

describe('developer payment completion', () => {
  it('activates exactly one thirty-day entitlement and the developer role after verified live payment', async () => {
    const id = await createOrder();
    await db.query("SELECT complete_grow_payment($1,'tx-live',11210,'live')", [id]);
    await db.query("SELECT complete_grow_payment($1,'tx-live',11210,'live')", [id]);
    const entitlements = await db.query<{ plan_code: string; workspace_owner_id: string; duration_days: number }>("SELECT plan_code,workspace_owner_id,round(extract(epoch from expires_at-starts_at)/86400)::int AS duration_days FROM grow_subscription_entitlements");
    expect(entitlements.rows).toEqual([{ plan_code: 'developer_monthly', workspace_owner_id: owner, duration_days: 30 }]);
    expect((await db.query("SELECT role FROM user_roles WHERE user_id=$1", [buyer])).rows).toEqual([{ role: 'developer' }]);
    expect((await db.query<{ active: boolean }>('SELECT developer_subscription_active($1) AS active', [owner])).rows[0]?.active).toBe(true);
  });

  it('never grants a role or entitlement for sandbox payment', async () => {
    const id = await createOrder('sandbox');
    await db.query("SELECT complete_grow_payment($1,'tx-sandbox',11210,'sandbox')", [id]);
    expect((await db.query('SELECT * FROM grow_subscription_entitlements')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM user_roles')).rows).toHaveLength(0);
    expect((await db.query<{ active: boolean }>('SELECT developer_subscription_active($1) AS active', [owner])).rows[0]?.active).toBe(false);
  });

  it('rejects missing terms, altered VAT and changed snapshots', async () => {
    await expect(db.query(`INSERT INTO grow_payment_orders(user_id,workspace_owner_id,environment,purpose,amount_ils,base_amount_ils,vat_amount_ils,duration_days,title,benefits,plan_code) VALUES($1,$2,'live','developer_subscription',11210,9500,1710,30,'title','benefits','developer_monthly')`, [buyer, owner])).rejects.toThrow();
    const id = await createOrder();
    await expect(db.query('UPDATE grow_payment_orders SET vat_amount_ils=1 WHERE id=$1', [id])).rejects.toThrow('developer_subscription_snapshot_immutable');
  });

  it('expires access and blocks developer-asset publication without active entitlement', async () => {
    await expect(db.query("INSERT INTO listings(workspace_owner_id,developer_project_id,is_published) VALUES($1,gen_random_uuid(),true)", [owner])).rejects.toThrow('developer_subscription_required');
    const id = await createOrder();
    await db.query("SELECT complete_grow_payment($1,'tx-expiry',11210,'live')", [id]);
    expect((await db.query('INSERT INTO listings(workspace_owner_id,developer_project_id,is_published) VALUES($1,gen_random_uuid(),true) RETURNING id', [owner])).rows).toHaveLength(1);
    await db.query("UPDATE grow_subscription_entitlements SET expires_at=now()-interval '1 second'");
    expect((await db.query<{ active: boolean }>('SELECT developer_subscription_active($1) AS active', [owner])).rows[0]?.active).toBe(false);
  });
});
