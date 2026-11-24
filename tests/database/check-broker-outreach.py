"""Exercise consent, OTP proof, deadlines, reply dedup and role fences without live accounts."""
import pathlib, subprocess, tempfile, shutil, os, pwd
root=pathlib.Path(__file__).resolve().parents[2]
temp=pathlib.Path(tempfile.mkdtemp(prefix='toraff-outreach-',dir='/tmp'));os.chmod(temp,0o777)
account=next(entry for entry in pwd.getpwall() if entry.pw_name in ('lovable','nobody'))
def run(args,**kwargs):return subprocess.run(args,check=True,user=account.pw_uid,group=account.pw_gid,**kwargs)
try:
 run(['initdb','-D',str(temp/'data'),'-A','trust'],stdout=subprocess.DEVNULL)
 run(['pg_ctl','-D',str(temp/'data'),'-l',str(temp/'log'),'-o',f'-k {temp} -p 55443 -h ""','-w','start'],stdout=subprocess.DEVNULL)
 psql=['psql','-h',str(temp),'-p','55443','-U',account.pw_name,'-d','postgres','-v','ON_ERROR_STOP=1']
 fixture="""
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='00000000-0000-0000-0000-000000000001'::uuid AND $2='super_admin'$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text);
CREATE TABLE user_roles(user_id uuid,role text);
INSERT INTO user_roles VALUES('00000000-0000-0000-0000-000000000001','super_admin');
CREATE TABLE demo_view_accounts(user_id uuid);
CREATE TABLE admin_broker_onboarding(user_id uuid,imported_license_number text,first_login_at timestamptz);
CREATE TABLE audit_logs(actor_id uuid,action text,target_table text,target_id text,details jsonb);
CREATE TABLE notifications(user_id uuid,event_type text,title text,body text,deep_link text,channel text,delivered boolean);
"""
 run(psql,input=fixture,text=True,stdout=subprocess.DEVNULL)
 for file in ['drizzle/migrations/0293_broker_opt_in_outreach_state.sql','drizzle/migrations/0294_broker_outreach_verified_phone_and_reply_fence.sql','tests/database/broker-outreach.sql']:
  run(psql+['-f',str(root/file)],stdout=subprocess.DEVNULL)
 print('Passed: consent, verified OTP only, exact 60-second deadline, one first-login alert, exact reply attribution, deduplication, opt-out and role denial')
finally:
 subprocess.run(['pg_ctl','-D',str(temp/'data'),'-m','immediate','stop'],user=account.pw_uid,group=account.pw_gid,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(temp)