CREATE OR REPLACE FUNCTION public.guard_inventory_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; owner uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  k:=public.listing_source_identity(OLD.source_url,OLD.external_id,OLD.source); owner:=coalesce(OLD.workspace_owner_id,OLD.user_id);
  IF k IS NOT NULL THEN INSERT INTO public.listing_source_tombstones(workspace_owner_id,source_key) VALUES(owner,k) ON CONFLICT DO NOTHING; END IF;
  RETURN OLD;
 END IF;
 k:=public.listing_source_identity(NEW.source_url,NEW.external_id,NEW.source); owner:=coalesce(NEW.workspace_owner_id,NEW.user_id);
 IF TG_OP='UPDATE' AND NEW.canonical_duplicate_of IS DISTINCT FROM OLD.canonical_duplicate_of AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'לא ניתן לשנות את זהות הנכס הקנונית'; END IF;
 IF NEW.canonical_duplicate_of IS NOT NULL THEN NEW.is_published:=false; NEW.affiliate_enabled:=false; END IF;
 IF NEW.status IN ('discarded','sold','removed','deleted','closed','archived','off_market','expired','inactive','נמכר','הוסר') THEN
  NEW.is_published:=false; NEW.affiliate_enabled:=false;
  IF k IS NOT NULL THEN INSERT INTO public.listing_source_tombstones(workspace_owner_id,source_key) VALUES(owner,k) ON CONFLICT DO NOTHING; END IF;
 END IF;
 IF k IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':'||k,91));
  IF (coalesce(NEW.is_published,false) OR coalesce(NEW.affiliate_enabled,false)) AND EXISTS(SELECT 1 FROM public.listing_source_tombstones WHERE workspace_owner_id=owner AND source_key=k) THEN RAISE EXCEPTION 'אפשר לשמור ולערוך את הנכס כטיוטה פנימית; פרסום דורש אישור זמינות מחדש'; END IF;
  IF EXISTS(SELECT 1 FROM public.listings l WHERE coalesce(l.workspace_owner_id,l.user_id)=owner AND public.listing_source_identity(l.source_url,l.external_id,l.source)=k AND l.id<>NEW.id AND l.canonical_duplicate_of IS NULL) AND NEW.canonical_duplicate_of IS NULL AND (TG_OP='INSERT' OR auth.uid() IS NOT NULL) THEN RAISE EXCEPTION 'הנכס כבר קיים בנכסים שלי' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_inventory_source() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_inventory_source() TO service_role;