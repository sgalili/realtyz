CREATE OR REPLACE FUNCTION public.imported_account_inventory_counts(owner_ids uuid[])
RETURNS TABLE (user_id uuid, projects bigint, apartments bigint, drafts bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT o.id,
   (SELECT count(*) FROM public.developers d JOIN public.developer_projects p ON p.developer_id = d.id WHERE d.workspace_owner_id = o.id),
   (SELECT count(*) FROM public.developers d JOIN public.developer_projects p ON p.developer_id = d.id CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.apartments) = 'array' THEN p.apartments ELSE '[]'::jsonb END) a WHERE d.workspace_owner_id = o.id),
   (SELECT count(*) FROM public.listings l WHERE l.workspace_owner_id = o.id AND l.is_published = false)
 FROM (SELECT DISTINCT unnest(owner_ids) AS id) o;
$$;
REVOKE ALL ON FUNCTION public.imported_account_inventory_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.imported_account_inventory_counts(uuid[]) TO service_role;