CREATE OR REPLACE FUNCTION public.get_import_broker_property_counts(_id uuid) RETURNS TABLE(broker_id uuid,saved_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT (b->>'broker_id')::uuid, (SELECT count(*) FROM public.listings l WHERE l.workspace_owner_id=(b->>'broker_id')::uuid AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(b->'listing_urls','[]'::jsonb)) u WHERE split_part(l.source_url,'?',1)=u.value)) FROM public.broker_import_jobs j CROSS JOIN LATERAL jsonb_array_elements(COALESCE(j.checkpoint->'brokerResults','[]'::jsonb)) b WHERE j.id=_id AND b->>'broker_id' IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.get_import_broker_property_counts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_import_broker_property_counts(uuid) TO authenticated;