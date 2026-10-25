CREATE TABLE IF NOT EXISTS public.test_broker_licenses (
  license_number text PRIMARY KEY CHECK (license_number ~ '^[1-9][0-9]{0,9}$'),
  user_id uuid NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.test_broker_licenses FROM anon, authenticated;
GRANT ALL ON public.test_broker_licenses TO service_role;
ALTER TABLE public.test_broker_licenses ENABLE ROW LEVEL SECURITY;

INSERT INTO public.test_broker_licenses(license_number, user_id, note)
SELECT '123456789', p.id, 'mock approved broker license for testing account'
FROM public.profiles p WHERE p.id = '7202f59b-7597-45b0-8c69-c7447b72c125'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_verified_broker_license(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT EXISTS(SELECT 1 FROM public.test_broker_licenses t WHERE t.user_id=_uid)
  OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_uid AND public.official_license_exists(p.broker_license_number)) $f$;

CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  SELECT _user_id IS NOT NULL
    AND NOT public.has_role(_user_id, 'developer')
    AND NOT public.has_role(_user_id, 'property_owner')
    AND NOT public.has_role(_user_id, 'property_seeker')
    AND (
      EXISTS(SELECT 1 FROM public.test_broker_licenses t WHERE t.user_id=_user_id)
      OR public.affiliate_tier3_eligible(_user_id)
      OR public.has_role(_user_id, 'managing_broker')
      OR public.has_role(_user_id, 'lead_agent')
      OR public.has_role(_user_id, 'agent')
    );
$f$;