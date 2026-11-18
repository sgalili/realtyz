CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT _user_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.demo_view_accounts d WHERE d.user_id=_user_id AND d.demo_type IN ('broker','affiliate')) OR EXISTS(SELECT 1 FROM public.profiles p JOIN public.admin_approved_broker_licenses a ON a.user_id=p.id AND a.license_number=p.broker_license_number WHERE p.id=_user_id AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role IN ('agent','lead_agent','managing_broker','junior_agent'))) OR EXISTS(SELECT 1 FROM public.official_brokers_registry r WHERE r.source_url='https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6' AND r.source_updated_at>now()-interval '7 days' AND r.source_updated_at<=now()+interval '1 minute' AND extract(year from r.source_updated_at)=extract(year from now()) AND (EXISTS(SELECT 1 FROM public.broker_license_verifications v JOIN public.profiles p ON p.id=v.user_id AND p.broker_license_number=v.license_number WHERE v.user_id=_user_id AND v.license_number=r.license_number AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role IN ('managing_broker','lead_agent','agent'))) OR EXISTS(SELECT 1 FROM public.affiliate_profiles ap WHERE ap.user_id=_user_id AND ap.license_status='verified' AND ap.license_number=r.license_number AND ap.license_verified_at IS NOT NULL)))) $function$;

CREATE OR REPLACE FUNCTION public.demo_developer_projects()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN EXISTS(SELECT 1 FROM demo_view_accounts WHERE user_id=auth.uid() AND demo_type IN ('developer','marketing'))
    THEN COALESCE((SELECT jsonb_agg((to_jsonb(p) - 'commission_config') || jsonb_build_object('developer_name', d.company_name, 'developer_logo', d.logo_url) ORDER BY p.created_at DESC)
      FROM developer_projects p JOIN developers d ON d.id=p.developer_id), '[]'::jsonb)
    ELSE NULL END
$function$;
REVOKE ALL ON FUNCTION public.demo_developer_projects() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.demo_developer_projects() TO authenticated;