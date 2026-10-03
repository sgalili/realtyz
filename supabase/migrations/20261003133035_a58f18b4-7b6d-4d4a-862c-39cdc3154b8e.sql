CREATE OR REPLACE FUNCTION public.campaign_delete_same_post(a public.campaign_logs, b public.campaign_logs)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT a.id=b.id OR (a.series_id IS NULL AND b.series_id IS NULL AND a.status NOT IN ('scheduled','pending','queued') AND b.status NOT IN ('scheduled','pending','queued') AND a.campaign_name IS NOT DISTINCT FROM b.campaign_name AND a.channel=b.channel AND a.created_at=b.created_at);
$$;
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.delete_campaign_post(uuid,uuid,boolean)'::regprocedure) INTO definition;
 definition := replace(definition,'(NOT p_entire_series AND campaign_name IS NOT DISTINCT FROM target.campaign_name AND channel=target.channel AND created_at=target.created_at)', '(NOT p_entire_series AND public.campaign_delete_same_post(campaign_logs, target))');
 EXECUTE definition;
END $$;