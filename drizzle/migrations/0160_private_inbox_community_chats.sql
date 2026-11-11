CREATE TABLE public.community_chat_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_owner_id uuid NOT NULL DEFAULT public.current_workspace_owner(),
 sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (sender_id <> recipient_id)
);
GRANT SELECT, INSERT ON public.community_chat_messages TO authenticated;
GRANT ALL ON public.community_chat_messages TO service_role;
ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.is_community_chat_member(_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role IN ('agent','managing_broker','lead_agent','junior_agent','assistant','developer')) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=_user AND NOT is_suspended) AND NOT EXISTS(SELECT 1 FROM public.user_bans WHERE user_id=_user AND lifted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.is_community_chat_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_community_chat_member(uuid) TO authenticated,service_role;
CREATE POLICY community_participant_read ON public.community_chat_messages FOR SELECT TO authenticated USING (auth.uid() IN (sender_id,recipient_id));
CREATE POLICY community_sender_insert ON public.community_chat_messages FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND public.ws_current_access(workspace_owner_id) AND public.is_community_chat_member(sender_id) AND public.is_community_chat_member(recipient_id));
CREATE INDEX community_sender_time ON public.community_chat_messages(sender_id,created_at DESC);
CREATE INDEX community_recipient_time ON public.community_chat_messages(recipient_id,created_at DESC);
CREATE FUNCTION public.community_chat_contacts(_search text DEFAULT '') RETURNS TABLE(id uuid,full_name text,avatar_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.id,p.full_name,p.avatar_url FROM public.profiles p WHERE public.is_community_chat_member(auth.uid()) AND p.id<>auth.uid() AND public.is_community_chat_member(p.id) AND p.full_name IS NOT NULL AND p.full_name ILIKE '%' || left(_search,100) || '%' ORDER BY p.full_name LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.community_chat_contacts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_chat_contacts(text) TO authenticated,service_role;
CREATE FUNCTION public.community_chat_threads() RETURNS TABLE(peer_id uuid,full_name text,avatar_url text,content text,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT ON (p.id) p.id,p.full_name,p.avatar_url,m.content,m.created_at FROM public.community_chat_messages m JOIN public.profiles p ON p.id=CASE WHEN m.sender_id=auth.uid() THEN m.recipient_id ELSE m.sender_id END WHERE auth.uid() IN (m.sender_id,m.recipient_id) ORDER BY p.id,m.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.community_chat_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_chat_threads() TO authenticated,service_role;
CREATE FUNCTION public.notify_private_inbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _ws uuid; _uid uuid; _lead uuid;
BEGIN
 IF TG_TABLE_NAME='community_chat_messages' THEN
  PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||NEW.sender_id::text,true);
  PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||NEW.recipient_id::text,true);
  RETURN NEW;
 ELSIF TG_TABLE_NAME='leads' THEN
  _ws:=COALESCE(NEW.workspace_owner_id,OLD.workspace_owner_id);
 ELSE
  _lead:=COALESCE(NEW.lead_id,OLD.lead_id);
  SELECT workspace_owner_id INTO _ws FROM public.leads WHERE id=_lead;
 END IF;
 FOR _uid IN SELECT _ws WHERE _ws IS NOT NULL UNION SELECT user_id FROM public.workspace_memberships WHERE workspace_owner_id=_ws LOOP
  PERFORM realtime.send('{}'::jsonb,'changed','inbox-events:'||_uid::text,true);
 END LOOP;
 RETURN COALESCE(NEW,OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.notify_private_inbox() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER community_inbox_wake AFTER INSERT ON public.community_chat_messages FOR EACH ROW EXECUTE FUNCTION public.notify_private_inbox();
CREATE TRIGGER lead_inbox_wake AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.notify_private_inbox();
CREATE TRIGGER message_inbox_wake AFTER INSERT OR UPDATE OR DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_private_inbox();
CREATE POLICY inbox_private_topic_allow ON realtime.messages FOR SELECT TO authenticated USING (realtime.topic()='inbox-events:'||auth.uid()::text);
CREATE POLICY inbox_private_topic_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated USING (realtime.topic() NOT LIKE 'inbox-events:%' OR realtime.topic()='inbox-events:'||auth.uid()::text);