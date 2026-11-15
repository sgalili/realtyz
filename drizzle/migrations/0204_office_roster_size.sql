CREATE OR REPLACE FUNCTION public.community_office_roster_size(_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH office AS (
  SELECT lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,'')))) AS name,
         nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'') AS city,
         nullif(lower(btrim(w.office_address)),'') AS address
  FROM public.white_label_settings w JOIN public.profiles p ON p.id=w.user_id
  WHERE w.user_id=_user AND auth.uid() IS NOT NULL
    AND NOT public.has_role(_user,'developer')
    AND nullif(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''))),'') IS NOT NULL
    AND nullif(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,''))),'') IS NOT NULL
)
SELECT count(*)::int FROM public.white_label_settings w
JOIN public.profiles p ON p.id=w.user_id
JOIN office o ON lower(btrim(coalesce(nullif(w.brokerage_name,''),nullif(w.agency_name,''))))=o.name
  AND nullif(lower(btrim(coalesce(nullif(w.office_city,''),nullif(p.locked_broker_city,''),nullif(p.city,'')))),'')=o.city
  AND (o.address IS NULL OR nullif(lower(btrim(w.office_address)),'') IS NULL OR lower(btrim(w.office_address))=o.address)
WHERE public.is_community_chat_member(w.user_id);
$$;
REVOKE ALL ON FUNCTION public.community_office_roster_size(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_office_roster_size(uuid) TO authenticated;