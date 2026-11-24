ALTER TABLE public.admin_broker_onboarding ADD COLUMN IF NOT EXISTS yad2_total_listings integer CHECK (yad2_total_listings IS NULL OR yad2_total_listings >= 0);

CREATE OR REPLACE FUNCTION public.my_yad2_import_gap(_owner uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN NULL ELSE (
    SELECT jsonb_build_object(
      'total', o.yad2_total_listings,
      'imported', (SELECT count(*) FROM public.listings l WHERE l.workspace_owner_id = _owner AND l.source_url ILIKE '%yad2.co.il%'))
    FROM public.admin_broker_onboarding o WHERE o.user_id = _owner) END
$$;
REVOKE ALL ON FUNCTION public.my_yad2_import_gap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_yad2_import_gap(uuid) TO authenticated;