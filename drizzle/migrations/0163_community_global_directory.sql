CREATE OR REPLACE FUNCTION public.is_community_chat_member(_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role IN ('agent','managing_broker','lead_agent','junior_agent','assistant','developer','affiliate')) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=_user AND NOT is_suspended) AND NOT EXISTS(SELECT 1 FROM public.user_bans WHERE user_id=_user AND lifted_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.community_directory(_search text DEFAULT '', _category text DEFAULT 'all') RETURNS TABLE(id uuid, full_name text, avatar_url text, category text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT * FROM (
  SELECT p.id, p.full_name, p.avatar_url,
   CASE WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role='developer') THEN 'developer'
        WHEN EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role IN ('agent','managing_broker','lead_agent','junior_agent','assistant')) THEN 'broker'
        ELSE 'partner' END AS category
  FROM public.profiles p
  WHERE public.is_community_chat_member(auth.uid()) AND p.id<>auth.uid() AND public.is_community_chat_member(p.id)
   AND p.full_name IS NOT NULL AND p.full_name ILIKE '%' || left(coalesce(_search,''),100) || '%'
 ) d WHERE coalesce(_category,'all')='all' OR d.category=_category
 ORDER BY d.full_name LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.community_directory(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_directory(text,text) TO authenticated, service_role;