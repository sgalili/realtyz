DROP FUNCTION public.community_profile_cards(uuid[]);

CREATE FUNCTION public.community_profile_cards(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text, logo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
SELECT p.id,p.full_name,CASE WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='developer') THEN 'developer' WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant')) THEN 'broker' WHEN p.primary_user_type='property_seeker' THEN 'buyer' WHEN p.primary_user_type='property_owner' THEN 'seller' WHEN p.primary_user_type='landlord' THEN 'landlord' WHEN p.primary_user_type='dealer' THEN 'dealer' ELSE 'partner' END,coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''),(SELECT d.company_name FROM public.developers d WHERE d.owner_user_id=p.id AND d.company_name IS NOT NULL LIMIT 1),nullif(a.display_name,'')),nullif(p.broker_license_number,''),coalesce(nullif(w.logo_url,''),nullif(w.landscape_logo_url,''))
FROM public.profiles p LEFT JOIN public.white_label_settings w ON w.user_id=p.id LEFT JOIN public.affiliate_profiles a ON a.user_id=p.id
WHERE auth.uid() IS NOT NULL AND p.id=ANY(_ids[1:200]) AND (p.id=auth.uid() OR (public.is_community_chat_member(auth.uid()) AND (public.is_community_chat_member(p.id) OR EXISTS(SELECT 1 FROM public.community_chat_messages m WHERE (m.sender_id=p.id AND m.recipient_id=auth.uid()) OR (m.recipient_id=p.id AND m.sender_id=auth.uid())))));
$$;

REVOKE ALL ON FUNCTION public.community_profile_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_profile_cards(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_profile_page(_user uuid)
RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text, avatar_url text, logo_url text, city text, service_areas text[], bio text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH cards AS (
 SELECT id,full_name,category,office_name,license_number FROM public.community_profile_cards(ARRAY[_user]) WHERE auth.uid() IS NOT NULL
 UNION ALL
 SELECT p.id,p.full_name,CASE WHEN public.has_role(p.id,'developer') THEN 'developer' ELSE 'broker' END,
 coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''),(SELECT d.company_name FROM public.developers d WHERE d.owner_user_id=p.id AND d.company_name IS NOT NULL LIMIT 1)),
 CASE WHEN public.partner_can_view_closing(p.id) THEN nullif(p.broker_license_number,'') END
 FROM public.profiles p LEFT JOIN public.white_label_settings w ON w.user_id=p.id
 WHERE p.id=_user AND public.is_community_chat_member(p.id)
 AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant','developer'))
 AND NOT EXISTS(SELECT 1 FROM public.community_profile_cards(ARRAY[_user]) WHERE auth.uid() IS NOT NULL)
)
SELECT c.id,c.full_name,c.category,c.office_name,c.license_number,nullif(p.avatar_url,''),coalesce(nullif(w.logo_url,''),nullif(w.landscape_logo_url,'')),coalesce(nullif(p.locked_broker_city,''),nullif(w.office_city,''),nullif(p.city,'')),p.service_areas::text[],
CASE WHEN length(btrim(coalesce(p.public_bio,'')))>=50 THEN btrim(p.public_bio) ELSE nullif(btrim(p.imported_public_bio),'') END
FROM cards c JOIN public.profiles p ON p.id=c.id LEFT JOIN public.white_label_settings w ON w.user_id=p.id;
$$;