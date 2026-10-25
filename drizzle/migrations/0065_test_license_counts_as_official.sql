CREATE OR REPLACE FUNCTION public.official_license_exists(_number text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT COALESCE(_number ~ '^[1-9][0-9]{0,9}$',false) AND (
  EXISTS(SELECT 1 FROM public.test_broker_licenses WHERE license_number=_number)
  OR EXISTS(SELECT 1 FROM public.official_brokers_registry WHERE license_number=_number AND source_url='https://data.gov.il/dataset/d361f6a6-898c-4e4d-8a80-abc4e8643bf6' AND source_updated_at > now()-interval '7 days' AND source_updated_at <= now()+interval '1 minute' AND extract(year from source_updated_at)=extract(year from now()))) $f$;