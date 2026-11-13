COMMENT ON COLUMN public.developer_projects.is_public IS 'DEPRECATED: public visibility derives from existing published project listings, never this flag';
CREATE OR REPLACE FUNCTION public.community_public_projects(_user uuid)
RETURNS TABLE(id uuid,name text,city text,address text,description text,image_url text,price_from numeric,available_units integer,delivery_date text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT d.id,d.name,d.city,d.address,d.description,d.image_url,d.price_from,d.available_units,d.delivery_date FROM public.developer_projects d WHERE d.workspace_owner_id=_user AND d.status NOT IN ('archived','deleted','closed','sold') AND EXISTS(SELECT 1 FROM public.community_profile_page(_user) p WHERE p.category='developer') AND EXISTS(SELECT 1 FROM public.listings l WHERE l.developer_project_id=d.id AND l.workspace_owner_id=d.workspace_owner_id AND l.is_published AND l.status='live' AND NOT coalesce(l.distribution_paused,false)) ORDER BY d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.community_public_projects(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_public_projects(uuid) TO authenticated,service_role;