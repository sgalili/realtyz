DROP FUNCTION IF EXISTS public.community_public_projects(uuid);
CREATE FUNCTION public.community_public_projects(_user uuid)
 RETURNS TABLE(id uuid, name text, city text, address text, description text, image_url text, price_from numeric, available_units integer, delivery_date text, timeline jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
SELECT d.id,d.name,d.city,d.address,d.description,d.image_url,d.price_from,d.available_units,d.delivery_date,
  (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(t)='object' THEN jsonb_strip_nulls(jsonb_build_object('label',coalesce(t->>'label',t->>'title',t->>'name',t->>'text',t->>'milestone'),'completed',(t->>'completed')::boolean,'current',(t->>'current')::boolean)) ELSE jsonb_build_object('label',t#>>'{}') END ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.timeline)='array' THEN d.timeline ELSE '[]'::jsonb END) WITH ORDINALITY AS x(t,ord))
FROM public.developer_projects d WHERE d.workspace_owner_id=_user AND d.status NOT IN ('archived','deleted','closed','sold') AND EXISTS(SELECT 1 FROM public.community_profile_page(_user) p WHERE p.category='developer') AND EXISTS(SELECT 1 FROM public.listings l WHERE l.developer_project_id=d.id AND l.workspace_owner_id=d.workspace_owner_id AND l.is_published AND l.status='live' AND NOT coalesce(l.distribution_paused,false)) ORDER BY d.created_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.community_public_projects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_public_projects(uuid) TO anon, authenticated, service_role;