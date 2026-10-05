CREATE OR REPLACE FUNCTION public.fb_group_key(_value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT regexp_replace(COALESCE(substring(_value from 'groups/([A-Za-z0-9._-]+)'), split_part(split_part(regexp_replace(coalesce(_value,''),'^(ext:|manual:)',''), '?',1),'#',1)), '/+$','') $$;
CREATE OR REPLACE FUNCTION public.fb_group_rejection(_reason text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT coalesce(_reason,'') ~* '(group_post_rejected|reject|declin|posting[_ ]disabled|not[_ ]allowed[_ ]to[_ ]post|not[_ ]a[_ ]member|not_member|banned|restrict|blocked|suspend|post.{0,30}removed|הפוסט.{0,40}(נדחה|נחסם|הוסר)|הפרסום.{0,30}(נדחה|נחסם)|פרסום.{0,20}(מוגבל|אסור)|נחסמת|אין הרשאה|אין הרשאת פרסום|לא חבר)' AND coalesce(_reason,'') !~* '(first.comment|תגובה ראשונה|התגובה הראשונה|pending.approval|awaiting.approval|ממתין לאישור|ממתינים לאישור|או שהעמוד לא נטען)' $$;
CREATE OR REPLACE FUNCTION public.fb_group_autoblock_on_failure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE gid text; restricted boolean; newly_failed boolean;
BEGIN
 IF NEW.activity_type <> 'fb_group_post' THEN RETURN NEW; END IF;
 gid := public.fb_group_key(NEW.target_ref);
 IF gid='' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
     UPDATE public.fb_user_groups SET fail_count=0 WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=gid AND fail_count>0;
     RETURN NEW;
   END IF;
   newly_failed := NEW.status='failed' AND OLD.status IS DISTINCT FROM 'failed';
 ELSE newly_failed := NEW.status='failed'; END IF;
 restricted := NEW.status <> 'completed' AND public.fb_group_rejection(NEW.last_error);
 IF NOT restricted AND NOT newly_failed THEN RETURN NEW; END IF;
 IF restricted THEN
   INSERT INTO public.fb_user_groups(workspace_owner_id,group_id,group_name,group_url,is_selected,is_blocked,blocked_reason,blocked_at,fail_count)
   SELECT NEW.workspace_owner_id,gid,coalesce(nullif(NEW.target_label,''),gid),'https://www.facebook.com/groups/'||gid,false,true,left(NEW.last_error,400),now(),1
   WHERE NOT EXISTS(SELECT 1 FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=gid)
   ON CONFLICT(workspace_owner_id,group_id) DO NOTHING;
 END IF;
 UPDATE public.fb_user_groups SET
   fail_count=fail_count+CASE WHEN newly_failed THEN 1 ELSE 0 END,
   is_blocked=is_blocked OR restricted OR (newly_failed AND fail_count+1>=3),
   blocked_at=CASE WHEN restricted OR (newly_failed AND fail_count+1>=3) THEN coalesce(blocked_at,now()) ELSE blocked_at END,
   blocked_reason=CASE WHEN restricted THEN left(NEW.last_error,400) WHEN newly_failed AND fail_count+1>=3 AND NOT is_blocked THEN left(coalesce(NEW.last_error,'כשלונות חוזרים'),400) ELSE blocked_reason END,
   is_selected=CASE WHEN is_blocked OR restricted OR (newly_failed AND fail_count+1>=3) THEN false ELSE is_selected END,
   updated_at=now()
 WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=gid;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fb_group_autoblock ON public.campaign_activity_queue;
CREATE TRIGGER trg_fb_group_autoblock AFTER INSERT OR UPDATE OF status,last_error ON public.campaign_activity_queue FOR EACH ROW EXECUTE FUNCTION public.fb_group_autoblock_on_failure();
CREATE OR REPLACE FUNCTION public.fb_group_queue_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reason text;
BEGIN
 IF NEW.activity_type<>'fb_group_post' OR NEW.status NOT IN ('pending','ready','processing') THEN RETURN NEW; END IF;
 SELECT blocked_reason INTO reason FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND is_blocked AND public.fb_group_key(group_id)=public.fb_group_key(NEW.target_ref) LIMIT 1;
 IF FOUND THEN
   NEW.status:='cancelled'; NEW.last_error:='group_blocked: '||coalesce(reason,'הקבוצה חסומה'); NEW.claimed_by:=NULL; NEW.claim_expires_at:=NULL;
 ELSIF public.fb_group_rejection(NEW.last_error) THEN
   NEW.status:='failed'; NEW.claimed_by:=NULL; NEW.claim_expires_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_fb_group_queue_guard BEFORE INSERT OR UPDATE ON public.campaign_activity_queue FOR EACH ROW EXECUTE FUNCTION public.fb_group_queue_guard();
CREATE OR REPLACE FUNCTION public.fb_group_block_cancel_queue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_blocked THEN
   UPDATE public.campaign_activity_queue SET status='cancelled',last_error='group_blocked: '||coalesce(NEW.blocked_reason,'הקבוצה חסומה'),claimed_by=NULL,claim_expires_at=NULL
   WHERE workspace_owner_id=NEW.workspace_owner_id AND activity_type='fb_group_post' AND status IN ('pending','ready','processing') AND public.fb_group_key(target_ref)=public.fb_group_key(NEW.group_id)
   AND NOT public.fb_group_rejection(last_error);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_fb_group_block_cancel AFTER INSERT OR UPDATE OF is_blocked ON public.fb_user_groups FOR EACH ROW EXECUTE FUNCTION public.fb_group_block_cancel_queue();
CREATE OR REPLACE FUNCTION public.fb_group_keep_deselected() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.is_blocked THEN NEW.is_selected:=false; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_fb_group_keep_deselected BEFORE INSERT OR UPDATE ON public.fb_user_groups FOR EACH ROW EXECUTE FUNCTION public.fb_group_keep_deselected();
CREATE OR REPLACE FUNCTION public.ext_group_post_guard(_token text,_owner uuid,_group text,_rejection text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pair public.extension_pairings; gid text; reason text;
BEGIN
 SELECT * INTO pair FROM public.extension_pairings WHERE token=_token AND revoked_at IS NULL;
 IF pair.id IS NULL OR pair.workspace_owner_id IS DISTINCT FROM _owner THEN RETURN jsonb_build_object('ok',false,'reason','workspace_mismatch'); END IF;
 gid:=public.fb_group_key(_group);
 IF gid='' THEN RETURN jsonb_build_object('ok',false,'reason','invalid_group'); END IF;
 IF public.fb_group_rejection(_rejection) THEN
   INSERT INTO public.fb_user_groups(workspace_owner_id,group_id,group_name,group_url,is_selected,is_blocked,blocked_reason,blocked_at)
   SELECT _owner,gid,gid,'https://www.facebook.com/groups/'||gid,false,true,left(_rejection,400),now()
   WHERE NOT EXISTS(SELECT 1 FROM public.fb_user_groups WHERE workspace_owner_id=_owner AND public.fb_group_key(group_id)=gid)
   ON CONFLICT(workspace_owner_id,group_id) DO NOTHING;
   UPDATE public.fb_user_groups SET is_blocked=true,is_selected=false,blocked_at=coalesce(blocked_at,now()),blocked_reason=left(_rejection,400),updated_at=now()
   WHERE workspace_owner_id=_owner AND public.fb_group_key(group_id)=gid;
 END IF;
 SELECT blocked_reason INTO reason FROM public.fb_user_groups WHERE workspace_owner_id=_owner AND public.fb_group_key(group_id)=gid AND is_blocked LIMIT 1;
 RETURN jsonb_build_object('ok',true,'blocked',FOUND,'reason',reason);
END $$;
REVOKE ALL ON FUNCTION public.ext_group_post_guard(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ext_group_post_guard(text,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.fb_group_autoblock_on_failure(),public.fb_group_queue_guard(),public.fb_group_block_cancel_queue() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fb_group_keep_deselected() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fb_group_key(text),public.fb_group_rejection(text) TO authenticated,service_role;