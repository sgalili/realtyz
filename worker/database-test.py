"""Validate the real queue migration against an isolated temporary PostgreSQL cluster."""
import os, pathlib, subprocess, tempfile, shutil
root = pathlib.Path(__file__).resolve().parents[1]
temp = pathlib.Path(tempfile.mkdtemp(prefix='toraff-queue-test-', dir='/tmp'))
os.chmod(temp, 0o777)
run = lambda args, **kwargs: subprocess.run(args, check=True, **kwargs)
as_user = ['runuser', '-u', 'nobody', '--']
binary = lambda name: str(pathlib.Path(shutil.which(name)).resolve())
cluster = temp / 'data'
try:
    run(as_user + [binary('initdb'), '-D', str(cluster), '-A', 'trust'], stdout=subprocess.DEVNULL)
    run(as_user + [binary('pg_ctl'), '-D', str(cluster), '-l', str(temp/'postgres.log'), '-o', f'-k {temp} -p 55439 -h ""', '-w', 'start'], stdout=subprocess.DEVNULL)
    psql = ['psql', '-h', str(temp), '-p', '55439', '-U', 'nobody', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    fixture = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid AND $2='super_admin' $$;
CREATE TABLE public.demo_view_accounts(user_id uuid);
CREATE TABLE public.broker_import_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid,workspace_owner_id uuid,status text DEFAULT 'running',stage text DEFAULT 'scanning',checkpoint jsonb DEFAULT '{}',lease_token uuid,lease_until timestamptz,step_started_at timestamptz,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),brokers_done integer DEFAULT 0,developers_done integer DEFAULT 0,listings_done integer DEFAULT 0,projects_done integer DEFAULT 0,units_done integer DEFAULT 0,skipped integer DEFAULT 0,error text);
CREATE FUNCTION public.wake_broker_import_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Unexpected legacy scan dispatch'; END $$;
CREATE TRIGGER broker_import_wake AFTER INSERT OR UPDATE OF checkpoint,status ON public.broker_import_jobs FOR EACH ROW EXECUTE FUNCTION public.wake_broker_import_job();
"""
    run(psql, input=fixture, text=True, stdout=subprocess.DEVNULL)
    run(psql + ['-f',str(root/'drizzle/migrations/0255_external_import_worker_queue.sql')], stdout=subprocess.DEVNULL)
    run(psql + ['-f',str(root/'drizzle/migrations/0256_protect_external_worker_identity_checkpoints.sql')], stdout=subprocess.DEVNULL)
    run(psql + ['-f',str(root/'tests/database/external-import-worker.sql')])
    print('Queue authorization, exclusive claims, saved counts, retry limit and pause tests passed')
finally:
    if cluster.exists():
        subprocess.run(as_user + [binary('pg_ctl'),'-D',str(cluster),'-m','immediate','stop'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    shutil.rmtree(temp)