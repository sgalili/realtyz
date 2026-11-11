CREATE TABLE public.community_chat_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid NOT NULL DEFAULT public.current_workspace_owner(),owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.community_chat_groups TO authenticated; GRANT ALL ON public.community_chat_groups TO service_role;
ALTER TABLE public.community_chat_groups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.community_group_members(group_id uuid NOT NULL REFERENCES public.community_chat_groups(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,joined_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(group_id,user_id));
GRANT SELECT ON public.community_group_members TO authenticated; GRANT ALL ON public.community_group_members TO service_role;
ALTER TABLE public.community_group_members ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.is_community_group_member(_group uuid,_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.community_group_members WHERE group_id=_group AND user_id=_user); $$;
REVOKE ALL ON FUNCTION public.is_community_group_member(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.is_community_group_member(uuid,uuid) TO authenticated,service_role;
CREATE POLICY group_member_read ON public.community_chat_groups FOR SELECT TO authenticated USING(public.is_community_group_member(id,auth.uid()));
CREATE POLICY member_roster_read ON public.community_group_members FOR SELECT TO authenticated USING(public.is_community_group_member(group_id,auth.uid()));
CREATE TABLE public.community_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL REFERENCES public.community_chat_groups(id) ON DELETE CASCADE,sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.community_group_messages TO authenticated; GRANT ALL ON public.community_group_messages TO service_role;
ALTER TABLE public.community_group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_message_read ON public.community_group_messages FOR SELECT TO authenticated USING(public.is_community_group_member(group_id,auth.uid()));
CREATE POLICY group_message_send ON public.community_group_messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND public.is_community_group_member(group_id,auth.uid()) AND public.is_community_chat_member(auth.uid()));
CREATE INDEX group_message_time ON public.community_group_messages(group_id,created_at DESC);
CREATE FUNCTION public.create_community_chat_group(_name text,_members uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _group uuid; _member uuid; _ws uuid; BEGIN
 IF NOT public.is_community_chat_member(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(btrim(_name)) NOT BETWEEN 1 AND 100 OR cardinality(_members) NOT BETWEEN 1 AND 49 THEN RAISE EXCEPTION 'invalid_group'; END IF;
 _ws:=public.current_workspace_owner(); IF NOT public.ws_current_access(_ws) THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOREACH _member IN ARRAY _members LOOP IF _member IS NULL OR NOT public.is_community_chat_member(_member) THEN RAISE EXCEPTION 'invalid_member'; END IF; END LOOP;
 INSERT INTO public.community_chat_groups(workspace_owner_id,owner_id,name) VALUES(_ws,auth.uid(),btrim(_name)) RETURNING id INTO _group;
 INSERT INTO public.community_group_members(group_id,user_id) VALUES(_group,auth.uid());
 INSERT INTO public.community_group_members(group_id,user_id) SELECT _group,x FROM unnest(_members) x ON CONFLICT DO NOTHING;
 RETURN _group; END; $$;
REVOKE ALL ON FUNCTION public.create_community_chat_group(text,uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_community_chat_group(text,uuid[]) TO authenticated,service_role;
CREATE FUNCTION public.manage_community_group_member(_group uuid,_member uuid,_add boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.community_chat_groups WHERE id=_group AND owner_id=auth.uid()) OR NOT public.is_community_chat_member(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _member=auth.uid() THEN RAISE EXCEPTION 'owner_required'; END IF;
 IF _add THEN IF NOT public.is_community_chat_member(_member) THEN RAISE EXCEPTION 'invalid_member'; END IF;
 INSERT INTO public.community_group_members(group_id,user_id) VALUES(_group,_member) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.community_group_members WHERE group_id=_group AND user_id=_member; END IF; END; $$;
REVOKE ALL ON FUNCTION public.manage_community_group_member(uuid,uuid,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.manage_community_group_member(uuid,uuid,boolean) TO authenticated,service_role;
CREATE FUNCTION public.community_group_roster(_group uuid) RETURNS TABLE(user_id uuid,full_name text,avatar_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p.id,p.full_name,p.avatar_url FROM public.community_group_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.group_id=_group AND public.is_community_group_member(_group,auth.uid()) ORDER BY m.joined_at; $$;
REVOKE ALL ON FUNCTION public.community_group_roster(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.community_group_roster(uuid) TO authenticated,service_role;
CREATE TABLE public.rita_chat_interactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_owner_id uuid NOT NULL,requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,peer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,group_id uuid REFERENCES public.community_chat_groups(id) ON DELETE CASCADE,lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,action text NOT NULL CHECK(action IN ('reply','summary','lead')),prompt text NOT NULL,response text,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','cancelled','denied')),error_message text,model text,run_id text,created_at timestamptz NOT NULL DEFAULT now(),CHECK(num_nonnulls(peer_id,group_id,lead_id)=1));
GRANT SELECT ON public.rita_chat_interactions TO authenticated; GRANT ALL ON public.rita_chat_interactions TO service_role;
ALTER TABLE public.rita_chat_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rita_context_read ON public.rita_chat_interactions FOR SELECT TO authenticated USING((group_id IS NOT NULL AND public.is_community_group_member(group_id,auth.uid())) OR (peer_id IS NOT NULL AND auth.uid() IN (requested_by,peer_id)) OR (lead_id IS NOT NULL AND requested_by=auth.uid() AND public.ws_current_access(workspace_owner_id)));
CREATE INDEX rita_group_time ON public.rita_chat_interactions(group_id,created_at DESC);
CREATE INDEX rita_requester_time ON public.rita_chat_interactions(requested_by,created_at DESC);
CREATE TABLE public.rita_chat_gateway_state(id boolean PRIMARY KEY DEFAULT true CHECK(id),blocked boolean NOT NULL DEFAULT false,error_status integer,error_message text,updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.rita_chat_gateway_state TO service_role; ALTER TABLE public.rita_chat_gateway_state ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.notify_community_conversation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _uid uuid; BEGIN
 IF TG_TABLE_NAME='community_group_members' THEN
  FOR _uid IN SELECT user_id FROM public.community_group_members WHERE group_id=COALESCE(NEW.group_id,OLD.group_id) UNION SELECT COALESCE(NEW.user_id,OLD.user_id) LOOP PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||_uid::text,true); END LOOP;
 ELSIF NEW.group_id IS NOT NULL THEN
  FOR _uid IN SELECT user_id FROM public.community_group_members WHERE group_id=NEW.group_id LOOP PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||_uid::text,true); END LOOP;
 ELSE
  PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||NEW.requested_by::text,true);
  IF NEW.peer_id IS NOT NULL THEN PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||NEW.peer_id::text,true); END IF;
 END IF; RETURN COALESCE(NEW,OLD); END; $$;
REVOKE ALL ON FUNCTION public.notify_community_conversation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER group_members_wake AFTER INSERT OR DELETE ON public.community_group_members FOR EACH ROW EXECUTE FUNCTION public.notify_community_conversation();
CREATE TRIGGER group_messages_wake AFTER INSERT ON public.community_group_messages FOR EACH ROW EXECUTE FUNCTION public.notify_community_conversation();
CREATE TRIGGER rita_interaction_wake AFTER INSERT OR UPDATE ON public.rita_chat_interactions FOR EACH ROW EXECUTE FUNCTION public.notify_community_conversation();