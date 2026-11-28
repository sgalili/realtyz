DO $migration$
DECLARE definition text; target text := 'matched_property_ids=_result->''matched_property_ids''';
BEGIN
 SELECT pg_get_functiondef('public.sync_rita_post_call(uuid,text,jsonb)'::regprocedure) INTO definition;
 IF position(target IN definition)=0 THEN RAISE EXCEPTION 'Unexpected Rita sync definition'; END IF;
 definition:=replace(definition,target,'matched_property_ids=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(_result->''matched_property_ids'',''[]''::jsonb)))');
 EXECUTE definition;
END
$migration$;
REVOKE ALL ON FUNCTION public.sync_rita_post_call(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_rita_post_call(uuid,text,jsonb) TO service_role;