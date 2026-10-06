CREATE OR REPLACE FUNCTION public.prevent_duplicate_listing_source_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NEW.source_url IS NULL OR length(trim(NEW.source_url))=0 THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.workspace_owner_id,NEW.user_id)::text || ':' || NEW.source_url,0));
 IF EXISTS (SELECT 1 FROM public.listings WHERE source_url=NEW.source_url AND COALESCE(workspace_owner_id,user_id)=COALESCE(NEW.workspace_owner_id,NEW.user_id) AND id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN
 RAISE EXCEPTION 'Duplicate listing source in workspace' USING ERRCODE='unique_violation'; END IF;
 RETURN NEW;
END;
$function$;