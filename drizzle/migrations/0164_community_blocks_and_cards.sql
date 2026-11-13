CREATE TABLE public.community_user_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_user_blocks TO authenticated;
GRANT ALL ON public.community_user_blocks TO service_role;
ALTER TABLE public.community_user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_own_read ON public.community_user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY blocks_own_insert ON public.community_user_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
CREATE POLICY blocks_own_delete ON public.community_user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.community_is_blocked(_recipient uuid, _sender uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.community_user_blocks WHERE blocker_id=_recipient AND blocked_id=_sender);
$$;
REVOKE ALL ON FUNCTION public.community_is_blocked(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_is_blocked(uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS community_sender_insert ON public.community_chat_messages;
CREATE POLICY community_sender_insert ON public.community_chat_messages FOR INSERT TO authenticated
 WITH CHECK (sender_id = auth.uid() AND public.ws_current_access(workspace_owner_id) AND public.is_community_chat_member(sender_id) AND public.is_community_chat_member(recipient_id) AND NOT public.community_is_blocked(recipient_id, sender_id));

DROP FUNCTION IF EXISTS public.community_chat_threads();
CREATE FUNCTION public.community_chat_threads() RETURNS TABLE(peer_id uuid, full_name text, avatar_url text, content text, created_at timestamptz, last_sender_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT DISTINCT ON (p.id) p.id,p.full_name,p.avatar_url,m.content,m.created_at,m.sender_id FROM public.community_chat_messages m JOIN public.profiles p ON p.id=CASE WHEN m.sender_id=auth.uid() THEN m.recipient_id ELSE m.sender_id END WHERE auth.uid() IN (m.sender_id,m.recipient_id) ORDER BY p.id,m.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.community_chat_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_chat_threads() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_profile_cards(_ids uuid[]) RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT p.id, p.full_name,
  CASE WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='developer') THEN 'developer'
       WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant')) THEN 'broker'
       WHEN p.primary_user_type='property_seeker' THEN 'buyer'
       WHEN p.primary_user_type='property_owner' THEN 'seller'
       WHEN p.primary_user_type='landlord' THEN 'landlord'
       WHEN p.primary_user_type='dealer' THEN 'dealer'
       ELSE 'partner' END,
  coalesce(nullif(w.brokerage_name,''), nullif(w.agency_name,''), (SELECT d.company_name FROM public.developers d WHERE d.owner_user_id=p.id AND d.company_name IS NOT NULL LIMIT 1), nullif(a.display_name,'')),
  nullif(p.broker_license_number,'')
 FROM public.profiles p
 LEFT JOIN public.white_label_settings w ON w.user_id=p.id
 LEFT JOIN public.affiliate_profiles a ON a.user_id=p.id
 WHERE public.is_community_chat_member(auth.uid()) AND p.id = ANY(_ids[1:200]) AND p.id<>auth.uid()
   AND (public.is_community_chat_member(p.id) OR EXISTS(SELECT 1 FROM public.community_chat_messages m WHERE (m.sender_id=p.id AND m.recipient_id=auth.uid()) OR (m.recipient_id=p.id AND m.sender_id=auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.community_profile_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_profile_cards(uuid[]) TO authenticated, service_role;