CREATE OR REPLACE FUNCTION public.get_workspace_inventory_counts()
RETURNS TABLE(workspace_owner_id uuid, inventory_kind text, inventory_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH accessible AS (
    SELECT DISTINCT w.workspace_owner_id FROM public.get_my_workspaces() w
    WHERE auth.uid() IS NOT NULL
  ), classified AS (
    SELECT a.workspace_owner_id,
      CASE
        WHEN public.has_role(a.workspace_owner_id, 'developer'::public.app_role) THEN 'projects'
        WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = a.workspace_owner_id AND r.role IN ('agent', 'assistant', 'junior_agent', 'managing_broker', 'lead_agent', 'property_owner')) THEN 'properties'
      END AS inventory_kind
    FROM accessible a
  )
  SELECT c.workspace_owner_id, c.inventory_kind,
    CASE WHEN c.inventory_kind = 'projects' THEN
      (SELECT count(*) FROM public.developer_projects p WHERE p.workspace_owner_id = c.workspace_owner_id)
    ELSE
      (SELECT count(*) FROM public.listings l WHERE l.workspace_owner_id = c.workspace_owner_id
        AND l.status <> 'discarded' AND l.canonical_duplicate_of IS NULL
        AND l.status NOT IN ('sold', 'removed', 'deleted', 'closed', 'archived', 'off_market', 'נמכר', 'הוסר'))
    END AS inventory_count
  FROM classified c WHERE c.inventory_kind IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.get_workspace_inventory_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_inventory_counts() TO authenticated, service_role;