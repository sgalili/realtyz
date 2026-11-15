DROP FUNCTION public.community_directory(text, text);

CREATE FUNCTION public.community_directory(_search text DEFAULT ''::text, _category text DEFAULT 'all'::text)
RETURNS TABLE(id uuid, full_name text, avatar_url text, category text, office_name text, office_logo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
 SELECT * FROM (
  SELECT p.id, p.full_name, p.avatar_url,
   CASE WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='developer') THEN 'developer'
        WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant')) THEN 'broker'
        ELSE 'partner' END AS category,
   coalesce(
    nullif(w.brokerage_name,''),
    nullif(w.agency_name,''),
    (SELECT dev.company_name FROM public.developers dev WHERE dev.owner_user_id=p.id AND dev.company_name IS NOT NULL LIMIT 1),
    nullif(a.display_name,'')
   ) AS office_name,
   coalesce(nullif(w.logo_url,''),nullif(w.landscape_logo_url,'')) AS office_logo_url
  FROM public.profiles p
  LEFT JOIN public.white_label_settings w ON w.user_id=p.id
  LEFT JOIN public.affiliate_profiles a ON a.user_id=p.id
  WHERE public.is_community_chat_member(auth.uid()) AND p.id<>auth.uid() AND public.is_community_chat_member(p.id)
   AND p.full_name IS NOT NULL AND p.full_name ILIKE '%' || left(coalesce(_search,''),100) || '%'
 ) d WHERE coalesce(_category,'all')='all' OR d.category=_category
 ORDER BY d.full_name LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.community_directory(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_directory(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.super_admin_agency_identities(_user_ids uuid[])
RETURNS TABLE(user_id uuid, agency_name text, agency_logo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
 SELECT requested.user_id,
  coalesce(
   nullif(w.brokerage_name,''),
   nullif(w.agency_name,''),
   (SELECT dev.company_name FROM public.developers dev WHERE dev.owner_user_id=requested.user_id AND dev.company_name IS NOT NULL LIMIT 1),
   nullif(a.display_name,'')
  ) AS agency_name,
  coalesce(nullif(w.logo_url,''),nullif(w.landscape_logo_url,'')) AS agency_logo_url
 FROM (
  SELECT DISTINCT value AS user_id
  FROM unnest((coalesce(_user_ids, ARRAY[]::uuid[]))[1:500]) AS input(value)
 ) requested
 LEFT JOIN public.white_label_settings w ON w.user_id=requested.user_id
 LEFT JOIN public.affiliate_profiles a ON a.user_id=requested.user_id
 WHERE public.has_role(auth.uid(), 'super_admin'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.super_admin_agency_identities(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_agency_identities(uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.super_admin_agency_identities(uuid[]) IS 'Returns only agency display name and logo for up to 500 requested accounts to a server-verified Super Admin.';

CREATE OR REPLACE FUNCTION public.get_listing_publishers(_listing_ids uuid[])
RETURNS TABLE(listing_id uuid, workspace_owner_id uuid, publisher_name text, publisher_logo text, publisher_user_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id,
         COALESCE(l.workspace_owner_id, l.user_id),
         COALESCE(
           NULLIF(w.brokerage_name, ''),
           NULLIF(w.agency_name, ''),
           (SELECT dev.company_name FROM public.developers dev WHERE dev.owner_user_id=COALESCE(l.workspace_owner_id,l.user_id) AND dev.company_name IS NOT NULL LIMIT 1),
           NULLIF(p.full_name, ''),
           'משרד תיווך'
         ),
         COALESCE(NULLIF(w.logo_url, ''), NULLIF(w.landscape_logo_url, '')),
         NULLIF(u.full_name, '')
  FROM public.listings l
  LEFT JOIN public.white_label_settings w ON w.user_id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.profiles p ON p.id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.profiles u ON u.id = COALESCE(l.user_id, l.workspace_owner_id)
  WHERE auth.uid() IS NOT NULL AND l.id = ANY(_listing_ids)
  LIMIT 1000;
$$;