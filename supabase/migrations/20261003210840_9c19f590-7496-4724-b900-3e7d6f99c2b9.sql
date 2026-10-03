DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.submit_edited_group_repost(uuid,uuid[],jsonb,jsonb)'::regprocedure) INTO definition;
 definition := replace(definition, '''pending'',run_at,''scheduled'',''extension''', '''pending'',run_at,''pending_time_bank'',''extension''');
 definition := replace(definition, 'IF original_count<>cardinality(_original_job_ids)', 'IF _original_job_ids IS NULL OR original_count<>cardinality(_original_job_ids)');
 EXECUTE definition;
END $$;