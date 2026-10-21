ALTER TABLE public.fb_user_groups ADD COLUMN IF NOT EXISTS cloud_join_state text NOT NULL DEFAULT 'queued', ADD COLUMN IF NOT EXISTS membership_requirements jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS membership_answers jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS rules_accepted boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS cloud_checked_at timestamptz;
CREATE TABLE public.fb_group_join_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_owner_id uuid NOT NULL, group_row_id uuid NOT NULL REFERENCES public.fb_user_groups(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'queued', dispatch_token uuid NOT NULL DEFAULT gen_random_uuid(), attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), claim_expires_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(group_row_id));
GRANT SELECT ON public.fb_group_join_jobs TO authenticated;
GRANT ALL ON public.fb_group_join_jobs TO service_role;
ALTER TABLE public.fb_group_join_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY join_jobs_workspace_read ON public.fb_group_join_jobs FOR SELECT TO authenticated USING(public.ws_current_access(workspace_owner_id));
REVOKE SELECT ON public.fb_group_join_jobs FROM authenticated;
GRANT SELECT(id,workspace_owner_id,group_row_id,status,attempts,available_at,claim_expires_at,last_error,created_at,updated_at) ON public.fb_group_join_jobs TO authenticated;
CREATE OR REPLACE FUNCTION public.fb_group_key(_value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT regexp_replace(COALESCE(substring(_value from 'groups/([A-Za-z0-9._-]+)'), split_part(split_part(regexp_replace(coalesce(_value,''),'^(fb:|ext:|manual:)',''), '?',1),'#',1)), '/+$','') $$;
CREATE OR REPLACE FUNCTION public.fb_user_groups_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_owner_id::text,0));
 IF EXISTS(SELECT 1 FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND group_id=NEW.group_id) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=public.fb_group_key(NEW.group_id)) THEN RAISE EXCEPTION 'group_already_saved'; END IF;
 IF NOT NEW.is_blocked AND (SELECT count(*) FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND NOT is_blocked)>=300 THEN RAISE EXCEPTION 'group_limit_reached' USING HINT='100 active and 200 reserve'; END IF;
 IF auth.uid() IS NOT NULL THEN NEW.join_status:='not_joined'; NEW.pool_status:='waiting'; NEW.cloud_join_state:='queued'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.fb_rebalance_group_pool(_owner uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE active_count integer; promoted integer:=0;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.ws_current_access(_owner) THEN RAISE EXCEPTION 'not_authorized'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_owner::text,0));
 UPDATE public.fb_user_groups SET pool_status='blocked' WHERE workspace_owner_id=_owner AND is_blocked AND pool_status<>'blocked';
 UPDATE public.fb_user_groups SET pool_status='waiting',waiting_reason='not_ready' WHERE workspace_owner_id=_owner AND NOT is_blocked AND pool_status='active' AND (join_status<>'joined' OR NOT is_selected OR cooldown_until>now());
 UPDATE public.fb_user_groups SET cooldown_until=NULL WHERE workspace_owner_id=_owner AND cooldown_until<=now();
 UPDATE public.fb_user_groups g SET pool_status='waiting',waiting_reason='pool_full' FROM (SELECT id FROM public.fb_user_groups WHERE workspace_owner_id=_owner AND pool_status='active' AND NOT is_blocked ORDER BY cloud_checked_at ASC NULLS LAST,created_at OFFSET 100) x WHERE g.id=x.id;
 SELECT count(*) INTO active_count FROM public.fb_user_groups WHERE workspace_owner_id=_owner AND pool_status='active' AND NOT is_blocked;
 WITH candidates AS (SELECT id FROM public.fb_user_groups WHERE workspace_owner_id=_owner AND NOT is_blocked AND pool_status<>'active' AND join_status='joined' AND is_selected AND (cooldown_until IS NULL OR cooldown_until<=now()) ORDER BY updated_at,created_at LIMIT greatest(0,100-active_count)) UPDATE public.fb_user_groups g SET pool_status='active',waiting_reason=NULL FROM candidates c WHERE g.id=c.id;
 GET DIAGNOSTICS promoted=ROW_COUNT;
 WITH ranked AS (SELECT id,row_number() OVER(ORDER BY (join_status='joined') DESC,created_at,id) n FROM public.fb_user_groups WHERE workspace_owner_id=_owner AND NOT is_blocked AND pool_status<>'active') UPDATE public.fb_user_groups g SET pool_status=CASE WHEN r.n<=200 THEN 'waiting' ELSE 'overflow' END,waiting_reason=CASE WHEN r.n>200 THEN 'reserve_full' ELSE g.waiting_reason END FROM ranked r WHERE g.id=r.id AND g.pool_status IS DISTINCT FROM CASE WHEN r.n<=200 THEN 'waiting' ELSE 'overflow' END;
 RETURN promoted;
END $$;
REVOKE ALL ON FUNCTION public.fb_rebalance_group_pool(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fb_rebalance_group_pool(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fb_group_cloud_after_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.fb_group_join_jobs;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 PERFORM public.fb_rebalance_group_pool(NEW.workspace_owner_id);
 IF NOT NEW.is_blocked AND (TG_OP='INSERT' OR (NEW.membership_answers IS DISTINCT FROM OLD.membership_answers) OR (NEW.rules_accepted IS DISTINCT FROM OLD.rules_accepted)) AND NEW.join_status<>'joined' THEN
  INSERT INTO public.fb_group_join_jobs(workspace_owner_id,group_row_id) VALUES(NEW.workspace_owner_id,NEW.id) ON CONFLICT(group_row_id) DO UPDATE SET status='queued',dispatch_token=gen_random_uuid(),available_at=now(),last_error=NULL,updated_at=now() WHERE public.fb_group_join_jobs.status<>'processing' RETURNING * INTO j;
  IF j.id IS NOT NULL THEN
   PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/fb-group-manager',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('action','dispatch','job_id',j.id,'dispatch_token',j.dispatch_token));
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_fb_group_cloud_after_change AFTER INSERT OR UPDATE OF is_blocked,join_status,is_selected,membership_answers,rules_accepted ON public.fb_user_groups FOR EACH ROW EXECUTE FUNCTION public.fb_group_cloud_after_change();
CREATE OR REPLACE FUNCTION public.fb_group_cloud_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND (NEW.join_status IS DISTINCT FROM OLD.join_status OR NEW.cloud_join_state IS DISTINCT FROM OLD.cloud_join_state OR NEW.cloud_checked_at IS DISTINCT FROM OLD.cloud_checked_at OR NEW.membership_requirements IS DISTINCT FROM OLD.membership_requirements) THEN RAISE EXCEPTION 'cloud_membership_is_server_managed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_fb_group_cloud_status_guard BEFORE UPDATE ON public.fb_user_groups FOR EACH ROW EXECUTE FUNCTION public.fb_group_cloud_status_guard();
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fb_user_groups') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.fb_user_groups; END IF; END $$;