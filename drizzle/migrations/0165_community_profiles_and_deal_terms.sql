CREATE OR REPLACE FUNCTION public.community_profile_listings(_user uuid) RETURNS TABLE(id uuid, property_title text, city text, address text, deal_type text, asking_price numeric, image_url text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT l.id, l.property_title, l.city, l.address, l.deal_type::text, l.asking_price, l.image_url
 FROM public.listings l
 WHERE public.is_community_chat_member(auth.uid()) AND public.is_community_chat_member(_user)
   AND coalesce(l.workspace_owner_id, l.user_id) = _user
   AND l.is_published = true AND l.status = 'live' AND coalesce(l.distribution_paused,false) = false
 ORDER BY l.created_at DESC LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.community_profile_listings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_profile_listings(uuid) TO authenticated, service_role;

CREATE TABLE public.community_deal_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  peer_id uuid NOT NULL,
  property_reference text,
  my_share_percent numeric CHECK (my_share_percent IS NULL OR (my_share_percent >= 0 AND my_share_percent <= 100)),
  terms text NOT NULL CHECK (char_length(terms) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (created_by <> peer_id)
);
GRANT SELECT, INSERT ON public.community_deal_terms TO authenticated;
GRANT ALL ON public.community_deal_terms TO service_role;
ALTER TABLE public.community_deal_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_terms_participants_read ON public.community_deal_terms FOR SELECT TO authenticated USING (auth.uid() IN (created_by, peer_id));
CREATE POLICY deal_terms_creator_insert ON public.community_deal_terms FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.is_community_chat_member(auth.uid()) AND public.is_community_chat_member(peer_id) AND NOT public.community_is_blocked(peer_id, auth.uid()));
CREATE INDEX community_deal_terms_pair_idx ON public.community_deal_terms (created_by, peer_id);