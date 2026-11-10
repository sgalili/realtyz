DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.guard_inventory_source()'::regprocedure);
 definition:=replace(definition,$old$AND NEW.canonical_duplicate_of IS NULL THEN RAISE EXCEPTION 'הנכס כבר קיים בנכסים שלי'$old$, $new$AND NEW.canonical_duplicate_of IS NULL AND (TG_OP='INSERT' OR auth.uid() IS NOT NULL) THEN RAISE EXCEPTION 'הנכס כבר קיים בנכסים שלי'$new$);
 EXECUTE definition;
END $$;