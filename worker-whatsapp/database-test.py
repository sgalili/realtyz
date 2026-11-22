"""Exercise actual migrations against an isolated temporary PostgreSQL, never production data."""
import os, pathlib, subprocess, tempfile, shutil
root = pathlib.Path(__file__).resolve().parents[1]
temp = pathlib.Path(tempfile.mkdtemp(prefix='broker-wa-test-', dir='/tmp'))
os.chmod(temp, 0o777)
run = lambda args, **kwargs: subprocess.run(args, check=True, **kwargs)
as_user = ['runuser', '-u', 'nobody', '--']
binary = lambda name: str(pathlib.Path(shutil.which(name)).resolve())
cluster = temp / 'data'
try:
    run(as_user + [binary('initdb'), '-D', str(cluster), '-A', 'trust'], stdout=subprocess.DEVNULL)
    run(as_user + [binary('pg_ctl'), '-D', str(cluster), '-l', str(temp/'postgres.log'), '-o', f'-k {temp} -p 55440 -h ""', '-w', 'start'], stdout=subprocess.DEVNULL)
    psql = ['psql', '-h', str(temp), '-p', '55440', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    fixture = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid AND $2='super_admin' $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,phone text);
CREATE TABLE public.demo_view_accounts(user_id uuid);
CREATE TABLE public.listings(id uuid PRIMARY KEY,user_id uuid,workspace_owner_id uuid,source_url text);
CREATE TABLE public.broker_import_jobs(id uuid PRIMARY KEY,counter integer);
"""
    run(psql, input=fixture, text=True, stdout=subprocess.DEVNULL)
    for file in ['0263_broker_whatsapp_discovery_queue.sql', '0264_broker_whatsapp_expired_lease_recovery.sql']:
        run(psql + ['-f',str(root/'drizzle/migrations'/file)], stdout=subprocess.DEVNULL)
    run(psql + ['-f',str(root/'tests/database/broker-whatsapp-worker.sql')])
finally:
    if cluster.exists():
        subprocess.run(as_user + [binary('pg_ctl'),'-D',str(cluster),'-m','immediate','stop'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    shutil.rmtree(temp)