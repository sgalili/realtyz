-- Server-only allowlist of test broker licenses (no client grants, no policies).
CREATE TABLE IF NOT EXISTS public.test_broker_licenses (
  license_number text PRIMARY KEY CHECK (license_number ~ '^[1-9][0-9]{0,9}$'),
  user_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.test_broker_licenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_broker_licenses FROM anon, authenticated;
GRANT ALL ON public.test_broker_licenses TO service_role;

CREATE OR REPLACE FUNCTION public.official_license_exists(_number text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT COALESCE(_number ~ '^[1-9][0-9]{0,9}$',false) AND (
  EXISTS(SELECT 1 FROM public.test_broker_licenses WHERE license_number=_number)
  OR EXISTS(SELECT 1 FROM public.official_brokers_registry WHERE license_number=_number AND source_url='https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6' AND source_updated_at > now()-interval '7 days' AND source_updated_at <= now()+interval '1 minute' AND extract(year from source_updated_at)=extract(year from now()))) $function$;

INSERT INTO public.test_broker_licenses(license_number,user_id,note)
VALUES ('123456789','7202f59b-7597-45b0-8c69-c7447b72c125','mock license for testing account ברק ישראלי')
ON CONFLICT (license_number) DO NOTHING;
UPDATE public.profiles SET broker_license_number='123456789' WHERE id='7202f59b-7597-45b0-8c69-c7447b72c125';
INSERT INTO public.user_roles(user_id, role) VALUES ('7202f59b-7597-45b0-8c69-c7447b72c125','agent') ON CONFLICT DO NOTHING;
DELETE FROM public.broker_role_suspensions WHERE user_id='7202f59b-7597-45b0-8c69-c7447b72c125';
