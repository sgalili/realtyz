"""Exercise recurrence and alert claims on isolated PostgreSQL, never the live queue."""
import pathlib, subprocess, tempfile, shutil, os, pwd
root = pathlib.Path(__file__).resolve().parents[2]
temp = pathlib.Path(tempfile.mkdtemp(prefix='toraff-repeat-', dir='/tmp'))
os.chmod(temp, 0o777)
username = next(entry.pw_name for entry in pwd.getpwall() if entry.pw_name in ('lovable', 'nobody'))
account = pwd.getpwnam(username)
user = []
def run(args, **kwargs): return subprocess.run(args, check=True, user=account.pw_uid, group=account.pw_gid, **kwargs)
try:
    run(user + ['initdb', '-D', str(temp/'data'), '-A', 'trust'], stdout=subprocess.DEVNULL)
    run(user + ['pg_ctl', '-D', str(temp/'data'), '-l', str(temp/'log'), '-o', f'-k {temp} -p 55442 -h ""', '-w', 'start'], stdout=subprocess.DEVNULL)
    psql = ['psql', '-h', str(temp), '-p', '55442', '-U', username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    fixture = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid AND $2='super_admin' $$;
CREATE TABLE demo_view_accounts(user_id uuid);
CREATE TABLE audit_logs(actor_id uuid,action text,target_table text,target_id text,details jsonb);
CREATE TABLE listings(id uuid DEFAULT gen_random_uuid(),workspace_owner_id uuid,source_url text);
CREATE TABLE broker_import_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid,created_by uuid,target_brokers integer,min_listings integer,max_listings integer,status text DEFAULT 'running',stage text DEFAULT 'scanning',checkpoint jsonb DEFAULT '{}',brokers_done integer DEFAULT 0,listings_done integer DEFAULT 0,lease_token uuid,lease_until timestamptz,error text);
"""
    run(psql, input=fixture, text=True, stdout=subprocess.DEVNULL)
    for path in ['drizzle/migrations/0290_import_repeat_and_balance_alerts.sql','drizzle/migrations/0291_import_actual_property_counts.sql','drizzle/migrations/0292_protect_repeat_configuration_and_developer_cursor.sql','tests/database/import-repeat.sql']:
        run(psql + ['-f', str(root/path)], stdout=subprocess.DEVNULL)
    print('Passed: active-progress preservation, worker overwrite safety, exact next batch/cursor, one successor, OFF handoff, workspace counts, admin denial and 6-hour alert deduplication')
finally:
    subprocess.run(user + ['pg_ctl', '-D', str(temp/'data'), '-m', 'immediate', 'stop'], user=account.pw_uid, group=account.pw_gid, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(temp)