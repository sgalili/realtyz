REVOKE ALL ON FUNCTION public.merge_lead_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leads_auto_dedupe() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_lead_pair(uuid, uuid) TO service_role;