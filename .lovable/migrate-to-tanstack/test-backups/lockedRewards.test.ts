import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Opt-in live database checks: no accounts, listings or payments are mutated.
const live = process.env.RUN_CLOUD_RULE_TESTS === '1';
function query(sql: string) {
  const result = JSON.parse(execFileSync('lovable', ['supabase', 'query', sql, '--json'], { encoding: 'utf8' }));
  return JSON.stringify(result);
}
describe.skipIf(!live)('deployed locked partner reward safeguards', () => {
  it('all committed referrals have an immutable reward snapshot', () => {
    const data = query(`select count(*)::integer as missing from public.affiliate_referrals r left join public.listing_reward_snapshots s on s.listing_id=r.listing_id and s.affiliate_id=r.affiliate_id where s.id is null`);
    expect(data).toContain('"missing":0');
  });
  it('the live partner view reads frozen lead rates instead of subsequent publisher rates', () => {
    const data = query(`select pg_get_functiondef(oid) like '%coalesce(snap.tier1_amount,l.affiliate_tier1_amount)%' and pg_get_functiondef(oid) like '%coalesce(snap.tier2_amount,l.affiliate_tier2_amount)%' and pg_get_functiondef(oid) like '%coalesce(snap.tier3_amount,l.affiliate_tier3_amount)%' as locked from pg_proc where pronamespace='public'::regnamespace and proname='get_affiliate_referral_listings'`);
    expect(data).toContain('"locked":true');
  });
  it('closing payouts use the frozen property price, license gate and 80% share', () => {
    const data = query(`select pg_get_functiondef(oid) like '%snap.asking_price%' and pg_get_functiondef(oid) like '%partner_can_view_closing%' and pg_get_functiondef(oid) like '%THEN 80 ELSE 0%' and pg_get_functiondef(oid) not like '%l.commission_amount%' as locked from pg_proc where pronamespace='public'::regnamespace and proname='compute_closing_split'`);
    expect(data).toContain('"locked":true');
  });
  it('snapshot mutation is prohibited by its deployed trigger', () => {
    const data = query(`select exists(select 1 from pg_trigger where tgrelid='public.listing_reward_snapshots'::regclass and not tgisinternal and pg_get_triggerdef(oid) like '%BEFORE DELETE OR UPDATE%' ) or exists(select 1 from pg_trigger where tgrelid='public.listing_reward_snapshots'::regclass and not tgisinternal and pg_get_triggerdef(oid) like '%BEFORE UPDATE OR DELETE%') as immutable`);
    expect(data).toContain('"immutable":true');
  });
});
