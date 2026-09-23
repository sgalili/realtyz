CREATE OR REPLACE FUNCTION public.get_listing_publishers(_listing_ids uuid[])
RETURNS TABLE(listing_id uuid, workspace_owner_id uuid, publisher_name text, publisher_logo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id,
         COALESCE(l.workspace_owner_id, l.user_id),
         COALESCE(NULLIF(w.agency_name, ''), NULLIF(p.full_name, ''), 'משרד תיווך'),
         COALESCE(NULLIF(w.logo_url, ''), NULLIF(w.landscape_logo_url, ''), p.avatar_url)
  FROM public.listings l
  LEFT JOIN public.white_label_settings w ON w.user_id = COALESCE(l.workspace_owner_id, l.user_id)
  LEFT JOIN public.profiles p ON p.id = COALESCE(l.workspace_owner_id, l.user_id)
  WHERE auth.uid() IS NOT NULL AND l.id = ANY(_listing_ids)
  LIMIT 1000;
$$;
REVOKE ALL ON FUNCTION public.get_listing_publishers(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_publishers(uuid[]) TO authenticated;