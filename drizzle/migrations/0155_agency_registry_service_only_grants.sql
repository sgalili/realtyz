REVOKE ALL ON public.broker_import_agency_registry FROM anon, authenticated;
GRANT ALL ON public.broker_import_agency_registry TO service_role;