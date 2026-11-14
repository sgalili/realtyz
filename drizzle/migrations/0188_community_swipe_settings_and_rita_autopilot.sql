CREATE TABLE public.community_conversation_settings (user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('peer','group')), target_id uuid NOT NULL, workspace_owner_id uuid NOT NULL, autopilot boolean NOT NULL DEFAULT false, hidden_at timestamptz, PRIMARY KEY(user_id,kind,target_id));
GRANT SELECT ON public.community_conversation_settings TO authenticated;
GRANT ALL ON public.community_conversation_settings TO service_role;
ALTER TABLE public.community_conversation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_conversation_settings ON public.community_conversation_settings FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.set_community_conversation_setting(_kind text,_target uuid,_action text,_enabled boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u uuid:=auth.uid(); ws uuid; BEGIN
IF u IS NULL OR NOT public.is_community_chat_member(u) OR _kind NOT IN ('peer','group') OR _action NOT IN ('autopilot','hide','restore') THEN RAISE EXCEPTION 'forbidden'; END IF;
IF _kind='peer' THEN IF u=_target OR NOT public.is_community_chat_member(_target) OR public.community_is_blocked(u,_target) OR public.community_is_blocked(_target,u) THEN RAISE EXCEPTION 'forbidden'; END IF; ws:=public.current_workspace_owner(); IF NOT public.ws_current_access(ws) THEN RAISE EXCEPTION 'forbidden'; END IF;
ELSE SELECT workspace_owner_id INTO ws FROM public.community_chat_groups WHERE id=_target AND public.is_community_group_member(id,u); IF ws IS NULL OR (_action='autopilot' AND NOT EXISTS(SELECT 1 FROM public.community_chat_groups WHERE id=_target AND owner_id=u)) THEN RAISE EXCEPTION 'forbidden'; END IF; END IF;
INSERT INTO public.community_conversation_settings(user_id,kind,target_id,workspace_owner_id,autopilot,hidden_at) VALUES(u,_kind,_target,ws,CASE WHEN _action='autopilot' THEN _enabled ELSE false END,CASE WHEN _action='hide' THEN now() ELSE NULL END) ON CONFLICT(user_id,kind,target_id) DO UPDATE SET workspace_owner_id=ws,autopilot=CASE WHEN _action='autopilot' THEN _enabled WHEN _action='hide' THEN false ELSE community_conversation_settings.autopilot END,hidden_at=CASE WHEN _action='hide' THEN now() WHEN _action='restore' THEN NULL ELSE community_conversation_settings.hidden_at END;
END; $$;
REVOKE ALL ON FUNCTION public.set_community_conversation_setting(text,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_community_conversation_setting(text,uuid,text,boolean) TO authenticated;
ALTER TABLE public.rita_chat_interactions ADD COLUMN source_message_id uuid;
CREATE UNIQUE INDEX rita_autopilot_source_once ON public.rita_chat_interactions(requested_by,source_message_id) WHERE source_message_id IS NOT NULL;
CREATE FUNCTION public.enqueue_community_rita_autopilot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record; k text; t uuid; BEGIN
IF TG_TABLE_NAME='community_chat_messages' THEN k:='peer'; t:=NEW.sender_id; ELSE k:='group'; t:=NEW.group_id; END IF;
FOR s IN SELECT * FROM public.community_conversation_settings WHERE kind=k AND target_id=t AND autopilot AND hidden_at IS NULL AND user_id<>NEW.sender_id AND (k='group' OR user_id=NEW.recipient_id) LOOP
PERFORM net.http_post(url:='https://gvylyghwfysvydygqdtf.supabase.co/functions/v1/rita-conversation',headers:=public.internal_call_headers(),body:=jsonb_build_object('kind',k,'target',t,'action','reply','prompt','','autopilot_user',s.user_id,'source_message_id',NEW.id),timeout_milliseconds:=180000);
END LOOP; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.enqueue_community_rita_autopilot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER peer_rita_autopilot AFTER INSERT ON public.community_chat_messages FOR EACH ROW EXECUTE FUNCTION public.enqueue_community_rita_autopilot();
CREATE TRIGGER group_rita_autopilot AFTER INSERT ON public.community_group_messages FOR EACH ROW EXECUTE FUNCTION public.enqueue_community_rita_autopilot();