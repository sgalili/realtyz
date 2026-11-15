CREATE OR REPLACE FUNCTION public.community_profile_page(_user uuid)
RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text, avatar_url text, logo_url text, city text, service_areas text[], bio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH cards AS (
 SELECT * FROM public.community_profile_cards(ARRAY[_user]) WHERE auth.uid() IS NOT NULL
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
CREATE OR REPLACE FUNCTION public.community_office_members(_user uuid)
RETURNS TABLE(id uuid,full_name text,category text,office_name text,license_number text,avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH office AS (
 SELECT lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,'')))) AS name,
 nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'') AS city,
 nullif(lower(btrim(w.office_address)),'') AS address
 FROM public.white_label_settings w JOIN public.profiles p ON p.id=w.user_id
 WHERE w.user_id=_user AND EXISTS(SELECT 1 FROM public.community_profile_page(_user) WHERE category='broker')
), members AS (
 SELECT w.user_id FROM public.white_label_settings w JOIN public.profiles p ON p.id=w.user_id
 JOIN office o ON lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''))))=o.name
 AND nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'')=o.city
 AND (o.address IS NULL OR nullif(lower(btrim(w.office_address)),'') IS NULL OR lower(btrim(w.office_address))=o.address)
 WHERE public.is_community_chat_member(w.user_id) ORDER BY w.user_id LIMIT 200
)
SELECT c.id,c.full_name,c.category,c.office_name,c.license_number,c.avatar_url FROM members m
CROSS JOIN LATERAL public.community_profile_page(m.user_id) c WHERE c.category='broker';
$$;
CREATE OR REPLACE FUNCTION public.community_office_roster_size(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT count(*)::integer FROM public.community_office_members(_user);
$$;
CREATE OR REPLACE FUNCTION public.community_profile_genders(_ids uuid[])
RETURNS TABLE(id uuid,gender text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT p.id,CASE WHEN p.gender IN ('male','female') THEN p.gender ELSE NULL END
FROM unnest(_ids[1:200]) target(id) CROSS JOIN LATERAL public.community_profile_page(target.id) c JOIN public.profiles p ON p.id=c.id;
$$;
CREATE OR REPLACE FUNCTION public.community_profile_listings(_user uuid)
RETURNS TABLE(id uuid,property_title text,city text,address text,deal_type text,asking_price numeric,image_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT l.id,l.property_title,l.city,l.address,l.deal_type::text,l.asking_price,l.image_url
FROM public.listings l WHERE EXISTS(SELECT 1 FROM public.community_profile_page(_user))
AND coalesce(l.workspace_owner_id,l.user_id)=_user AND l.is_published AND l.status='live' AND NOT coalesce(l.distribution_paused,false)
ORDER BY l.created_at DESC LIMIT 50;
$$;
CREATE OR REPLACE FUNCTION public.get_listing_profile_targets(_listing_ids uuid[])
RETURNS TABLE(listing_id uuid,profile_user_id uuid,office_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH allowed AS (
 SELECT l.* FROM public.listings l WHERE l.id=ANY(_listing_ids[1:200]) AND
 ((auth.uid() IS NOT NULL AND public.ws_current_access(l.workspace_owner_id)) OR (l.is_published AND l.status='live' AND l.affiliate_enabled AND NOT coalesce(l.distribution_paused,false)))
), targets AS (
 SELECT l.id,l.source,l.source_metadata,CASE WHEN coalesce(l.source,'manual')='manual' THEN coalesce(l.workspace_owner_id,l.user_id)
 ELSE (SELECT min(p.id::text)::uuid FROM public.profiles p WHERE p.broker_license_number=l.source_metadata->>'broker_license_number' AND public.is_community_chat_member(p.id)
 AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant'))
 AND l.source_metadata->'broker_license_evidence'->>'source'='source_ad' AND l.source_metadata->'broker_license_evidence'->>'number'=p.broker_license_number
 AND l.source_metadata->'broker_license_evidence'->>'source_url' ~ '^https://([a-zA-Z0-9-]+\.)?yad2\.co\.il/.*item/[a-zA-Z0-9_-]+' HAVING count(*)=1) END AS target FROM allowed l
)
SELECT t.id,t.target,CASE WHEN coalesce(t.source,'manual')='manual' OR EXISTS(SELECT 1 FROM public.white_label_settings w WHERE w.user_id=t.target AND nullif(btrim(coalesce(t.source_metadata->>'office_name',t.source_metadata->>'agency_name')),'') IN (nullif(btrim(w.brokerage_name),''),nullif(btrim(w.agency_name),''))) THEN t.target ELSE NULL END
FROM targets t WHERE t.target IS NOT NULL AND public.is_community_chat_member(t.target)
AND (auth.uid() IS NOT NULL OR EXISTS(SELECT 1 FROM public.community_profile_page(t.target) WHERE category IN ('broker','developer')));
$$;
REVOKE ALL ON FUNCTION public.community_profile_page(uuid), public.community_office_details(uuid), public.community_office_members(uuid), public.community_office_roster_size(uuid), public.community_profile_genders(uuid[]), public.community_profile_listings(uuid), public.community_public_projects(uuid), public.get_listing_profile_targets(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_profile_page(uuid), public.community_office_details(uuid), public.community_office_members(uuid), public.community_office_roster_size(uuid), public.community_profile_genders(uuid[]), public.community_profile_listings(uuid), public.community_public_projects(uuid), public.get_listing_profile_targets(uuid[]) TO anon,authenticated,service_role;