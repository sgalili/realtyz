CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
 SELECT _user_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.official_brokers_registry r
   WHERE r.source_url='https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6'
     AND r.source_updated_at > now()-interval '7 days'
     AND r.source_updated_at <= now()+interval '1 minute'
     AND extract(year from r.source_updated_at)=extract(year from now())
     AND (
       EXISTS (SELECT 1 FROM public.broker_license_verifications v
               JOIN public.profiles p ON p.id=v.user_id AND p.broker_license_number=v.license_number
               WHERE v.user_id=_user_id AND v.license_number=r.license_number
               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role IN ('managing_broker','lead_agent','agent')))
       OR EXISTS (SELECT 1 FROM public.affiliate_profiles ap
                  WHERE ap.user_id=_user_id AND ap.license_status='verified'
                    AND ap.license_number=r.license_number AND ap.license_verified_at IS NOT NULL)
     )
 );
$function$;
REVOKE ALL ON FUNCTION public.partner_can_view_closing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_can_view_closing(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.partner_can_view_closing(uuid) IS 'Closing-price entitlement requires official current registry evidence and server-verified broker identity; no role-only, Super Admin or test-license bypass.';