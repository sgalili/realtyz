CREATE OR REPLACE FUNCTION public.community_profile_page(_user uuid)
RETURNS TABLE(id uuid, full_name text, category text, office_name text, license_number text, avatar_url text, logo_url text, city text, service_areas text[], bio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT c.id, c.full_name, c.category, c.office_name, c.license_number,
  nullif(p.avatar_url,''),
  coalesce(nullif(w.logo_url,''), nullif(w.landscape_logo_url,'')),
  coalesce(nullif(p.locked_broker_city,''), nullif(w.office_city,''), nullif(p.city,'')),
  CASE WHEN p.service_areas IS NULL THEN NULL ELSE ARRAY(SELECT x::text FROM unnest(p.service_areas::text[]) x) END,
  (SELECT nullif(ap.professional_bio,'') FROM public.agent_personas ap WHERE ap.user_id=p.id AND ap.professional_bio IS NOT NULL ORDER BY ap.updated_at DESC LIMIT 1)
FROM public.community_profile_cards(ARRAY[_user]) c
JOIN public.profiles p ON p.id=c.id
LEFT JOIN public.white_label_settings w ON w.user_id=p.id;
$$;
REVOKE ALL ON FUNCTION public.community_profile_page(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_profile_page(uuid) TO authenticated, service_role;