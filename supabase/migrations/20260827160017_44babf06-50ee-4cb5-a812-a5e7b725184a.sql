-- Permanent per-listing image blocklist: photos the broker deleted can never be
-- restored by any sync source (Yad2 / Homely / Facebook / manual re-scrape).
CREATE OR REPLACE FUNCTION public.trg_listings_media_blocklist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  blocked jsonb := '[]'::jsonb;
  meta jsonb := coalesce(NEW.source_metadata, '{}'::jsonb);
  arr_key text;
BEGIN
  IF jsonb_typeof(meta) <> 'object' THEN
    meta := '{}'::jsonb;
  END IF;

  -- Blocklist carried on the row plus anything already blocked before this update
  IF jsonb_typeof(coalesce(meta -> 'removed_photo_keys', 'null'::jsonb)) = 'array' THEN
    blocked := meta -> 'removed_photo_keys';
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(coalesce(OLD.source_metadata -> 'removed_photo_keys', 'null'::jsonb)) = 'array' THEN
    SELECT coalesce(jsonb_agg(DISTINCT v), '[]'::jsonb) INTO blocked
    FROM (
      SELECT lower(x) AS v FROM jsonb_array_elements_text(blocked) AS a(x)
      UNION
      SELECT lower(x) AS v FROM jsonb_array_elements_text(OLD.source_metadata -> 'removed_photo_keys') AS b(x)
    ) s;
  END IF;

  -- Normalise blocked entries to canonical media keys
  SELECT coalesce(jsonb_agg(DISTINCT k), '[]'::jsonb) INTO blocked
  FROM (
    SELECT coalesce(nullif(public.media_dedupe_key(x), ''), lower(x)) AS k
    FROM jsonb_array_elements_text(blocked) AS t(x)
  ) n
  WHERE k IS NOT NULL AND k <> '';

  meta := jsonb_set(meta, '{removed_photo_keys}', blocked, true);

  -- Strip blocked keys (and duplicates) from every gallery array on the row
  IF jsonb_typeof(coalesce(to_jsonb(NEW.media_photos), 'null'::jsonb)) = 'array' THEN
    NEW.media_photos := public.dedupe_media_jsonb(to_jsonb(NEW.media_photos), blocked);
  END IF;

  FOREACH arr_key IN ARRAY ARRAY['photos', 'images', 'media_urls', 'cached_media_urls', 'image_urls', 'all_images', 'gallery']
  LOOP
    IF jsonb_typeof(coalesce(meta -> arr_key, 'null'::jsonb)) = 'array' THEN
      meta := jsonb_set(meta, ARRAY[arr_key], public.dedupe_media_jsonb(meta -> arr_key, blocked));
    END IF;
  END LOOP;

  NEW.source_metadata := meta;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_media_blocklist ON public.listings;
CREATE TRIGGER trg_listings_media_blocklist
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.trg_listings_media_blocklist();