DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.delete_campaign_post(uuid,uuid,boolean)'::regprocedure) INTO definition;
 definition := replace(definition, 'q.workspace_owner_id=p_workspace_owner_id AND (', 'q.workspace_owner_id=p_workspace_owner_id AND (p_entire_series OR target.status NOT IN (''scheduled'',''pending'',''queued'') OR q.scheduled_for=target.sent_at OR q.payload->>''campaign_log_id''=p_post_id::text OR q.payload->>''post_id''=p_post_id::text) AND (');
 EXECUTE definition;
END $$;