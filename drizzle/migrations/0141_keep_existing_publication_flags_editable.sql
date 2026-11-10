DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.guard_inventory_source()'::regprocedure);
 definition:=replace(definition,$old$IF (coalesce(NEW.is_published,false) OR coalesce(NEW.affiliate_enabled,false)) AND EXISTS$old$,$new$IF (coalesce(NEW.is_published,false) OR coalesce(NEW.affiliate_enabled,false)) AND (TG_OP='INSERT' OR (NEW.is_published IS DISTINCT FROM OLD.is_published AND NEW.is_published) OR (NEW.affiliate_enabled IS DISTINCT FROM OLD.affiliate_enabled AND NEW.affiliate_enabled)) AND EXISTS$new$);
 EXECUTE definition;
END $$;