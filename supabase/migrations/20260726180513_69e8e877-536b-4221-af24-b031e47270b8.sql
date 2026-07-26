CREATE OR REPLACE FUNCTION public.protect_listing_media_arrays()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_count int := COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(OLD.media_photos) = 'array' THEN OLD.media_photos ELSE '[]'::jsonb END), 0);
  new_count int := COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(NEW.media_photos) = 'array' THEN NEW.media_photos ELSE '[]'::jsonb END), 0);
  purge boolean := COALESCE((NEW.source_metadata->>'media_purge')::boolean, false);
BEGIN
  IF purge THEN
    RETURN NEW;
  END IF;
  -- Never let a sync clear or collapse an existing gallery.
  IF old_count > 0 AND new_count = 0 THEN
    NEW.media_photos := OLD.media_photos;
  ELSIF old_count > 1 AND new_count = 1 THEN
    NEW.media_photos := OLD.media_photos;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_listing_media_arrays ON public.listings;
CREATE TRIGGER trg_protect_listing_media_arrays
BEFORE UPDATE OF media_photos ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.protect_listing_media_arrays();