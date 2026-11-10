CREATE OR REPLACE FUNCTION public.listing_source_identity(_url text,_external text,_source text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE
 WHEN coalesce(_url,'') ~* '(^https?://)?([^/]+\.)?yad2\.co\.il/.*/item/' THEN 'yad2:'||lower(substring(_url from '/item/(?:[^/?#]+/)?([^/?#]+)'))
 WHEN _source='yad2' AND nullif(trim(_external),'') IS NOT NULL THEN 'yad2:'||lower(trim(_external))
 WHEN _source<>'yad2' AND nullif(trim(_external),'') IS NOT NULL THEN _source||':'||lower(trim(_external))
 WHEN coalesce(_url,'') ~* 'yad2\.co\.il/' THEN NULL
 WHEN nullif(trim(_url),'') IS NOT NULL THEN 'url:'||regexp_replace(trim(_url),'#.*$','') END
$$;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.guard_inventory_source()'::regprocedure);
 definition:=replace(definition,'IF NEW.canonical_duplicate_of IS DISTINCT FROM OLD.canonical_duplicate_of THEN','IF NEW.canonical_duplicate_of IS DISTINCT FROM OLD.canonical_duplicate_of AND auth.uid() IS NOT NULL THEN');
 EXECUTE definition;
END $$;