"""Test admin aggregation and verified-only gender classification on an isolated database."""
import pathlib, subprocess, tempfile, shutil, os, pwd
root = pathlib.Path(__file__).resolve().parents[2]
temp = pathlib.Path(tempfile.mkdtemp(prefix='toraff-admin-efficiency-', dir='/tmp')); os.chmod(temp, 0o777)
account = next(a for a in pwd.getpwall() if a.pw_name in ('lovable','nobody'))
def run(args, **kwargs): return subprocess.run(args, check=True, user=account.pw_uid, group=account.pw_gid, **kwargs)
try:
 run(['initdb','-D',str(temp/'data'),'-A','trust'],stdout=subprocess.DEVNULL)
 run(['pg_ctl','-D',str(temp/'data'),'-l',str(temp/'log'),'-o',f'-k {temp} -p 55445 -h ""','-w','start'],stdout=subprocess.DEVNULL)
 psql=['psql','-h',str(temp),'-p','55445','-U',account.pw_name,'-d','postgres','-v','ON_ERROR_STOP=1']
 fixture="""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid AND $2='super_admin' $$;
CREATE TABLE profiles(id uuid PRIMARY KEY, full_name text, gender text, locked_broker_name text, broker_license_number text);
CREATE TABLE broker_license_verifications(user_id uuid,license_number text,verified_at timestamptz);
CREATE TABLE admin_approved_broker_licenses(user_id uuid,license_number text);
CREATE TABLE auth.users(id uuid PRIMARY KEY,last_sign_in_at timestamptz);
CREATE TABLE admin_broker_onboarding(user_id uuid,import_source text,first_invitation_at timestamptz,first_login_at timestamptz,invited_at timestamptz);
CREATE TABLE listings(workspace_owner_id uuid,status text,is_published boolean,affiliate_enabled boolean,canonical_duplicate_of uuid);
"""
 run(psql,input=fixture,text=True,stdout=subprocess.DEVNULL)
 guess=(root/'drizzle/migrations/0316_migration.sql').read_text().split('CREATE OR REPLACE FUNCTION public.fill_empty_gender_for')[0]
 run(psql,input=guess,text=True,stdout=subprocess.DEVNULL)
 for file in ['drizzle/migrations/0318_verified_broker_gender_classification.sql','drizzle/migrations/0319_batch_admin_broker_onboarding_status.sql','drizzle/migrations/0320_pending_import_account_ids.sql','tests/database/admin-efficiency.sql']:
  run(psql+['-f',str(root/file)],stdout=subprocess.DEVNULL)
 print('Passed: verified-only classification, saved gender unchanged, ambiguous skips persisted, stale license excluded, auth denial, exact pending invitation filtering and aggregate stages.')
finally:
 subprocess.run(['pg_ctl','-D',str(temp/'data'),'-m','immediate','stop'],user=account.pw_uid,group=account.pw_gid,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(temp)