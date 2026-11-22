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
    for file in ['0263_broker_whatsapp_discovery_queue.sql', '0264_broker_whatsapp_expired_lease_recovery.sql', '0265_broker_whatsapp_discovery_only.sql', '0268_broker_wa_stale_recovery_and_phone_suggestion.sql', '0269_broker_wa_preserve_live_bulk_backlog.sql', '0270_broker_whatsapp_contact_completion.sql', '0271_broker_whatsapp_bulk_stop.sql']:
        run(psql + ['-f',str(root/'drizzle/migrations'/file)], stdout=subprocess.DEVNULL)
    run(psql + ['-f',str(root/'tests/database/broker-whatsapp-worker.sql')])
    run(psql + ['-f',str(root/'tests/database/broker-whatsapp-conflict-fixture.sql')],stdout=subprocess.DEVNULL)
    # Wait until a concurrent manual writer holds the row, before discovery saves the old value.
    writer=subprocess.Popen(psql+['-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    writer.stdin.write("BEGIN;\nUPDATE public.broker_whatsapp_contacts SET whatsapp_phone='972503333333',whatsapp_link='https://wa.me/972503333333' WHERE broker_id='00000000-0000-0000-0000-000000000004';\nSELECT 'row_locked';\nSELECT pg_sleep(1);\nCOMMIT;\n")
    writer.stdin.close()
    while writer.stdout.readline().strip()!='row_locked':
        if writer.poll() is not None: raise RuntimeError('Manual writer did not acquire contact lock')
    run(psql + ['-f',str(root/'tests/database/broker-whatsapp-conflict.sql')])
    writer.wait(timeout=5)
    run(psql + ['-f',str(root/'tests/database/broker-whatsapp-bulk-stop.sql')])
finally:
    if cluster.exists():
        subprocess.run(as_user + [binary('pg_ctl'),'-D',str(cluster),'-m','immediate','stop'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    shutil.rmtree(temp)