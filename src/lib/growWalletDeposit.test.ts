import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const buyer = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE grow_payment_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,environment text,amount_ils numeric CONSTRAINT grow_payment_orders_amount_ils_check CHECK(amount_ils=6500),duration_days int,title text,benefits text,status text DEFAULT 'pending',transaction_id text,paid_at timestamptz,UNIQUE(environment,transaction_id));
  CREATE TABLE grow_subscription_entitlements(order_id uuid,user_id uuid,title text,benefits text,starts_at timestamptz,expires_at timestamptz);
  CREATE TABLE credit_transactions(user_id uuid,amount_ils numeric,type text,reference_id uuid,note text);
  CREATE FUNCTION add_credit(uuid,numeric,text,uuid,text) RETURNS void LANGUAGE sql AS $$INSERT INTO credit_transactions VALUES($1,$2,$3,$4,$5)$$;`);
  await db.exec(readFileSync('drizzle/migrations/0191_grow_wallet_deposit_orders.sql','utf8'));
},30000);
beforeEach(async () => { await db.exec('TRUNCATE grow_payment_orders,grow_subscription_entitlements,credit_transactions'); });
afterAll(async () => { await db.close(); });
async function deposit(env = 'live') {
  const result = await db.query<{id:string}>(`INSERT INTO grow_payment_orders(user_id,workspace_owner_id,environment,amount_ils,duration_days,title,benefits,purpose) VALUES($1,$2,$3,200.25,1,'Deposit','','wallet_topup') RETURNING id`,[buyer,owner,env]);
  return result.rows[0]?.id;
}
it('credits the exact deposit to the snapshotted wallet once, never a subscription',async () => {
  const id = await deposit();
  await db.query("SELECT complete_grow_payment($1,'tx',200.25,'live')",[id]);
  await db.query("SELECT complete_grow_payment($1,'tx',200.25,'live')",[id]);
  const result = await db.query('SELECT user_id,amount_ils,type FROM credit_transactions');
  expect(result.rows).toEqual([{user_id:owner,amount_ils:'200.25',type:'topup'}]);
  expect((await db.query('SELECT * FROM grow_subscription_entitlements')).rows).toHaveLength(0);
});
it('sandbox never credits funds',async () => {
  const id=await deposit('sandbox');await db.query("SELECT complete_grow_payment($1,'tx',200.25,'sandbox')",[id]);
  expect((await db.query('SELECT * FROM credit_transactions')).rows).toHaveLength(0);
});
it('rejects mismatched paid amounts',async () => {
  const id=await deposit();await expect(db.query("SELECT complete_grow_payment($1,'tx',201,'live')",[id])).rejects.toThrow('payment_mismatch');
  expect((await db.query('SELECT * FROM credit_transactions')).rows).toHaveLength(0);
});