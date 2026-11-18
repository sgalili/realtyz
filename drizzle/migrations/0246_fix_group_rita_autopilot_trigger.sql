CREATE OR REPLACE FUNCTION public.enqueue_community_rita_autopilot()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE s record; k text; t uuid; r uuid; j jsonb := to_jsonb(NEW); BEGIN
IF TG_TABLE_NAME='community_chat_messages' THEN k:='peer'; t:=NEW.sender_id; r:=(j->>'recipient_id')::uuid; ELSE k:='group'; t:=(j->>'group_id')::uuid; END IF;
FOR s IN SELECT * FROM public.community_conversation_settings WHERE kind=k AND target_id=t AND autopilot AND hidden_at IS NULL AND user_id<>NEW.sender_id AND (k='group' OR user_id=r) LOOP
  BEGIN
    PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/rita-conversation',headers:=public.internal_call_headers(),body:=jsonb_build_object('kind',k,'target',t,'action','reply','prompt','','autopilot_user',s.user_id,'source_message_id',NEW.id),timeout_milliseconds:=180000);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'rita autopilot dispatch failed: %', SQLERRM;
  END;
END LOOP; RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'rita autopilot enqueue failed: %', SQLERRM; RETURN NEW;
END; $function$;