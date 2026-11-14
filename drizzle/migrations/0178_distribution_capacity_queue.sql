CREATE OR REPLACE FUNCTION public.reserve_distribution_slot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.fb_user_groups; d date; slot timestamptz; day_start timestamptz; group_used int; page_used int; account_used int; group_cap int; page_key text; i int;
BEGIN
 IF NEW.activity_type<>'fb_group_post' OR NEW.status NOT IN ('pending','ready') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.scheduled_for IS NOT DISTINCT FROM OLD.scheduled_for AND NEW.target_ref IS NOT DISTINCT FROM OLD.target_ref AND OLD.status IN ('pending','ready') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_owner_id::text,0));
 SELECT * INTO g FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=public.fb_group_key(NEW.target_ref) LIMIT 1;
 IF g.id IS NULL OR g.is_blocked OR NOT g.is_selected OR g.join_status<>'joined' THEN RETURN NEW; END IF;
 group_cap:=CASE WHEN g.max_posts_per_day>0 THEN g.max_posts_per_day WHEN NEW.runner='cloud' THEN 1 ELSE 2147483647 END;
 page_key:=public.fb_job_page_id(NEW);
 slot:=greatest(coalesce(NEW.scheduled_for,now()),now(),coalesce(g.cooldown_until,now()));
 FOR i IN 0..365 LOOP
  d:=(slot AT TIME ZONE 'Asia/Jerusalem')::date;
  day_start:=d::timestamp AT TIME ZONE 'Asia/Jerusalem';
  SELECT coalesce(sum(post_count),0) INTO group_used FROM public.fb_group_post_log WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=public.fb_group_key(g.group_id) AND posted_on=d;
  SELECT group_used+count(*) INTO group_used FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=NEW.workspace_owner_id AND q.id<>NEW.id AND q.activity_type='fb_group_post' AND q.status IN ('pending','ready','processing') AND public.fb_group_key(q.target_ref)=public.fb_group_key(g.group_id) AND (q.scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date=d;
  SELECT count(*),count(*) FILTER(WHERE coalesce(page_id,'account')=page_key) INTO account_used,page_used FROM public.fb_account_post_attempts WHERE workspace_owner_id=NEW.workspace_owner_id AND attempted_at>=day_start AND attempted_at<(d+1)::timestamp AT TIME ZONE 'Asia/Jerusalem';
  SELECT account_used+count(*),page_used+count(*) FILTER(WHERE public.fb_job_page_id(q)=page_key) INTO account_used,page_used FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=NEW.workspace_owner_id AND q.id<>NEW.id AND q.activity_type='fb_group_post' AND q.runner='cloud' AND q.status IN ('pending','ready') AND (q.scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date=d;
  IF group_used<group_cap AND (NEW.runner<>'cloud' OR (account_used<100 AND page_used<35)) THEN
   SELECT greatest(slot,coalesce(max(q.scheduled_for)+interval '7 minutes',slot)) INTO slot FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=NEW.workspace_owner_id AND q.id<>NEW.id AND q.activity_type='fb_group_post' AND q.status IN ('pending','ready','processing') AND (q.scheduled_for AT TIME ZONE 'Asia/Jerusalem')::date=d AND (public.fb_group_key(q.target_ref)=public.fb_group_key(g.group_id) OR (NEW.runner='cloud' AND q.runner='cloud'));
   IF (slot AT TIME ZONE 'Asia/Jerusalem')::time<time '21:00' THEN EXIT; END IF;
  END IF;
  slot:=(d+1+time '09:00') AT TIME ZONE 'Asia/Jerusalem';
 END LOOP;
 IF i=365 THEN RAISE EXCEPTION 'distribution_capacity_unavailable'; END IF;
 IF slot>coalesce(NEW.scheduled_for,now()) THEN
  NEW.scheduled_for:=slot;
  NEW.publication_status:='pending_time_bank';
  NEW.payload:=coalesce(NEW.payload,'{}'::jsonb)||jsonb_build_object('distribution_queue',true,'queue_reason','daily_channel_capacity');
  IF jsonb_typeof(NEW.payload->'job')='object' THEN NEW.payload:=jsonb_set(NEW.payload,'{job,scheduledTime}',to_jsonb(extract(epoch from slot)*1000)); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reserve_distribution_slot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_distribution_slot() TO service_role;
CREATE TRIGGER trg_distribution_capacity BEFORE INSERT OR UPDATE OF scheduled_for,target_ref,status ON public.campaign_activity_queue FOR EACH ROW EXECUTE FUNCTION public.reserve_distribution_slot();
CREATE OR REPLACE FUNCTION public.notify_distribution_backlog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g public.fb_user_groups; cap int; backlog int; key text; day_key text;
BEGIN
 IF NEW.activity_type<>'fb_group_post' OR NEW.status NOT IN ('pending','ready') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_owner_id::text,0));
 key:=public.fb_group_key(NEW.target_ref); day_key:=(now() AT TIME ZONE 'Asia/Jerusalem')::date::text;
 SELECT * INTO g FROM public.fb_user_groups WHERE workspace_owner_id=NEW.workspace_owner_id AND public.fb_group_key(group_id)=key AND NOT is_blocked AND is_selected AND join_status='joined' LIMIT 1;
 IF g.id IS NULL THEN RETURN NEW; END IF;
 cap:=CASE WHEN g.max_posts_per_day>0 THEN g.max_posts_per_day WHEN NEW.runner='cloud' THEN 1 ELSE NULL END;
 IF cap IS NULL THEN RETURN NEW; END IF;
 SELECT count(*) INTO backlog FROM public.campaign_activity_queue q WHERE q.workspace_owner_id=NEW.workspace_owner_id AND q.activity_type='fb_group_post' AND q.status IN ('pending','ready') AND public.fb_group_key(q.target_ref)=key;
 IF backlog>cap AND NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.user_id=NEW.workspace_owner_id AND n.event_type='distribution_backlog' AND n.delivery_result->>'workspace'=NEW.workspace_owner_id::text AND n.delivery_result->>'group'=key AND n.delivery_result->>'day'=day_key) THEN
  INSERT INTO public.notifications(user_id,event_type,title,body,deep_link,channel,delivery_result) VALUES(NEW.workspace_owner_id,'distribution_backlog','כדאי להרחיב את רשת ההפצה',format('בתור ההמתנה ל־%s יש %s פרסומים, מעבר למכסה של יום אחד (%s). הוספת קבוצות או ערוצים פעילים יכולה לקצר את ההמתנה.',coalesce(g.group_name,key),backlog,cap),'/campaigns','in_app',jsonb_build_object('workspace',NEW.workspace_owner_id,'group',key,'day',day_key,'backlog',backlog,'daily_limit',cap));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_distribution_backlog() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_distribution_backlog() TO service_role;
CREATE TRIGGER trg_distribution_backlog AFTER INSERT OR UPDATE OF scheduled_for,status,target_ref ON public.campaign_activity_queue FOR EACH ROW EXECUTE FUNCTION public.notify_distribution_backlog();