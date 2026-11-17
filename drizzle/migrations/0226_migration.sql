CREATE OR REPLACE FUNCTION public.developer_subscription_active(_workspace uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 -- Developers post for free: access requires only a workspace-authorized developer account (or Super Admin).
 SELECT CASE
  WHEN auth.uid() IS NULL OR _workspace IS NULL OR NOT public.ws_current_access(_workspace) THEN false
  WHEN public.has_role(auth.uid(),'super_admin') THEN true
  ELSE public.has_role(_workspace,'developer')
 END
$function$;