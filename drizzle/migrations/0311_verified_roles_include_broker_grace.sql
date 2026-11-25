CREATE OR REPLACE FUNCTION public.get_verified_user_roles()
 RETURNS SETOF app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT role FROM public.user_roles WHERE user_id=auth.uid() AND (role NOT IN ('agent','lead_agent','managing_broker','junior_agent') OR public.has_verified_broker_license(user_id)
  OR (role='agent' AND EXISTS(SELECT 1 FROM public.broker_license_grace g WHERE g.user_id=auth.uid() AND g.expires_at>now() AND g.expired_at IS NULL))) $function$;