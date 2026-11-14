ALTER TABLE public.white_label_settings ADD COLUMN IF NOT EXISTS agency_description text;

CREATE OR REPLACE FUNCTION public.community_office_members(_user uuid)
RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
WITH office AS (
  SELECT lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,'')))) AS name,
         nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'') AS city,
         nullif(lower(btrim(w.office_address)),'') AS address
  FROM public.white_label_settings w
  JOIN public.profiles p ON p.id=w.user_id
  WHERE w.user_id=_user
    AND nullif(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''))),'') IS NOT NULL
    AND nullif(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,''))),'') IS NOT NULL
), members AS (
  SELECT w.user_id
  FROM public.white_label_settings w
  JOIN public.profiles p ON p.id=w.user_id
  JOIN office o ON lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''))))=o.name
    AND nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'')=o.city
    AND (o.address IS NULL OR nullif(lower(btrim(w.office_address)),'') IS NULL OR lower(btrim(w.office_address))=o.address)
  WHERE public.is_community_chat_member(w.user_id)
)
SELECT c.id,c.full_name,c.category,c.office_name,c.license_number,p.avatar_url
FROM public.community_profile_cards(ARRAY(SELECT user_id FROM members ORDER BY user_id LIMIT 200)) c
JOIN public.profiles p ON p.id=c.id
WHERE EXISTS(SELECT 1 FROM public.community_profile_page(_user));
$function$;

CREATE OR REPLACE FUNCTION public.community_office_details(_user uuid)
RETURNS TABLE(office_name text, description text, logo_url text, city text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
WITH office AS (
  SELECT coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,'')) AS name,
         nullif(btrim(w.agency_description),'') AS description,
         coalesce(nullif(w.logo_url,''),nullif(w.landscape_logo_url,'')) AS logo_url,
         nullif(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,''))),'') AS city,
         nullif(lower(btrim(w.office_address)),'') AS address
  FROM public.white_label_settings w
  JOIN public.profiles p ON p.id=w.user_id
  WHERE w.user_id=_user
), matched AS (
  SELECT w.user_id,nullif(btrim(w.agency_description),'') AS description
  FROM public.white_label_settings w
  JOIN public.profiles p ON p.id=w.user_id
  JOIN office o ON lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''))))=lower(btrim(o.name))
    AND nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'')=lower(btrim(o.city))
    AND (o.address IS NULL OR nullif(lower(btrim(w.office_address)),'') IS NULL OR lower(btrim(w.office_address))=o.address)
  WHERE o.city IS NOT NULL AND public.is_community_chat_member(w.user_id)
)
SELECT o.name,
       coalesce(o.description,(SELECT m.description FROM matched m WHERE m.description IS NOT NULL ORDER BY (m.user_id=_user) DESC,m.user_id LIMIT 1)),
       o.logo_url,o.city
FROM office o
WHERE o.name IS NOT NULL AND EXISTS(SELECT 1 FROM public.community_profile_page(_user));
$function$;

REVOKE ALL ON FUNCTION public.community_office_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_office_details(uuid) TO authenticated, service_role;