DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.submit_edited_group_repost(uuid,uuid[],jsonb,jsonb)'::regprocedure) INTO definition;
 definition := replace(definition, 'ARRAY(SELECT jsonb_array_elements_text(COALESCE(_post->''media_urls'',''[]''::jsonb))),group_ids,', 'COALESCE(_post->''media_urls'',''[]''::jsonb),to_jsonb(group_ids),');
 EXECUTE definition;
END $$;