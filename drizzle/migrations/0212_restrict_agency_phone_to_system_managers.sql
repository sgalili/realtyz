REVOKE SELECT, INSERT, UPDATE ON TABLE public.white_label_settings FROM anon, authenticated;

GRANT SELECT (id, user_id, agency_name, logo_url, primary_color, primary_foreground_color, hide_kalpiz_branding, created_at, updated_at, landscape_logo_url, office_address, public_email, brokerage_name, brokerage_license, office_city, agency_description) ON public.white_label_settings TO authenticated;
GRANT INSERT (user_id, agency_name, logo_url, primary_color, primary_foreground_color, hide_kalpiz_branding, landscape_logo_url, office_address, public_email, brokerage_name, brokerage_license, office_city, agency_description) ON public.white_label_settings TO authenticated;
GRANT UPDATE (user_id, agency_name, logo_url, primary_color, primary_foreground_color, hide_kalpiz_branding, landscape_logo_url, office_address, public_email, brokerage_name, brokerage_license, office_city, agency_description) ON public.white_label_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.get_agency_phone_admin(_owner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN (
      SELECT w.office_phone
      FROM public.white_label_settings w
      WHERE w.user_id = _owner_id
      LIMIT 1
    )
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.get_agency_phone_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agency_phone_admin(uuid) TO authenticated, service_role;
COMMENT ON COLUMN public.white_label_settings.office_phone IS 'RESTRICTED: readable by Super Admins through get_agency_phone_admin; no direct anon/authenticated column grants.';
COMMENT ON FUNCTION public.get_agency_phone_admin(uuid) IS 'Returns an agency office phone only to a server-verified Super Admin; all other callers receive NULL.';