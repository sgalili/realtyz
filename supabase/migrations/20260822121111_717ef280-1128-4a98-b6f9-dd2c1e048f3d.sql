ALTER TABLE public.fb_comment_replies RENAME COLUMN ayrshare_reply_id TO meta_reply_id;
ALTER TABLE public.fb_comment_replies RENAME COLUMN ayrshare_response TO meta_response;

CREATE OR REPLACE FUNCTION public.sync_fb_comment_reply_to_crm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  v_lead uuid;
BEGIN
  SELECT * INTO c FROM fb_comments WHERE id = NEW.comment_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_lead := public.upsert_lead_from_interaction(
    'facebook', c.author_name, c.author_fb_id, c.author_name, NULL, NULL, NULL, NEW.posted_by
  );
  PERFORM public.record_interaction_message(
    v_lead, 'facebook', 'outbound',
    CASE WHEN NEW.mode = 'ai' THEN 'ai' ELSE 'agent' END,
    NEW.final_text,
    'fb_reply:' || COALESCE(NEW.meta_reply_id, NEW.id::text),
    COALESCE(NEW.posted_at, now()),
    jsonb_build_object('kind', 'comment_reply')
  );
  RETURN NEW;
END;
$function$;

DROP TABLE IF EXISTS public.ayrshare_action_log CASCADE;
DROP TABLE IF EXISTS public.ayrshare_webhook_events CASCADE;
DROP TABLE IF EXISTS public.ayrshare_social_accounts CASCADE;
DROP TABLE IF EXISTS public.workspace_social_profile CASCADE;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS ayrshare_profile_key;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS ayrshare_ref_id;