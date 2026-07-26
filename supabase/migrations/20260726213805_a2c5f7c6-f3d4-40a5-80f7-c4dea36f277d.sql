-- 1. Canonical dedupe key for a media URL (filename, lowercased, query stripped)
CREATE OR REPLACE FUNCTION public.media_dedupe_key(_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(split_part(coalesce(_url, ''), '?', 1), '^.*/', ''))
$$;

-- 2. Dedupe a jsonb array of media urls, preserving order, dropping blocked keys
CREATE OR REPLACE FUNCTION public.dedupe_media_jsonb(_arr jsonb, _blocked jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item jsonb;
  url text;
  k text;
  seen text[] := ARRAY[]::text[];
  blocked text[] := ARRAY[]::text[];
  out_arr jsonb := '[]'::jsonb;
BEGIN
  IF _arr IS NULL OR jsonb_typeof(_arr) <> 'array' THEN
    RETURN _arr;
  END IF;

  IF _blocked IS NOT NULL AND jsonb_typeof(_blocked) = 'array' THEN
    SELECT coalesce(array_agg(lower(v)), ARRAY[]::text[]) INTO blocked
    FROM jsonb_array_elements_text(_blocked) AS t(v);
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_arr)
  LOOP
    IF jsonb_typeof(item) = 'string' THEN
      url := item #>> '{}';
    ELSE
      url := coalesce(item->>'url', item->>'src', item::text);
    END IF;

    k := public.media_dedupe_key(url);
    IF k IS NULL OR k = '' THEN
      k := lower(coalesce(url, ''));
    END IF;

    IF k = ANY(seen) OR k = ANY(blocked) THEN
      CONTINUE;
    END IF;

    seen := seen || k;
    out_arr := out_arr || jsonb_build_array(item);
  END LOOP;

  RETURN out_arr;
END;
$$;

-- 3. Trigger: never store duplicates (or previously removed images) on campaign posts
CREATE OR REPLACE FUNCTION public.trg_dedupe_campaign_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  blocked jsonb := coalesce(NEW.provider_response -> 'removed_media_keys', '[]'::jsonb);
BEGIN
  IF NEW.media_urls IS NOT NULL AND jsonb_typeof(NEW.media_urls) = 'array' THEN
    NEW.media_urls := public.dedupe_media_jsonb(NEW.media_urls, blocked);
  END IF;

  IF NEW.provider_response IS NOT NULL AND jsonb_typeof(NEW.provider_response) = 'object' THEN
    IF jsonb_typeof(coalesce(NEW.provider_response -> 'media_urls', 'null'::jsonb)) = 'array' THEN
      NEW.provider_response := jsonb_set(
        NEW.provider_response, '{media_urls}',
        public.dedupe_media_jsonb(NEW.provider_response -> 'media_urls', blocked));
    END IF;
    IF jsonb_typeof(coalesce(NEW.provider_response -> 'cached_media_urls', 'null'::jsonb)) = 'array' THEN
      NEW.provider_response := jsonb_set(
        NEW.provider_response, '{cached_media_urls}',
        public.dedupe_media_jsonb(NEW.provider_response -> 'cached_media_urls', blocked));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dedupe_campaign_media ON public.campaign_logs;
CREATE TRIGGER trg_dedupe_campaign_media
BEFORE INSERT OR UPDATE ON public.campaign_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_dedupe_campaign_media();

-- 4. One-off cleanup of every existing post
UPDATE public.campaign_logs
SET media_urls = public.dedupe_media_jsonb(media_urls, coalesce(provider_response -> 'removed_media_keys', '[]'::jsonb))
WHERE jsonb_typeof(media_urls) = 'array'
  AND media_urls IS DISTINCT FROM public.dedupe_media_jsonb(media_urls, coalesce(provider_response -> 'removed_media_keys', '[]'::jsonb));

UPDATE public.campaign_logs
SET provider_response = jsonb_set(provider_response, '{media_urls}',
      public.dedupe_media_jsonb(provider_response -> 'media_urls', coalesce(provider_response -> 'removed_media_keys', '[]'::jsonb)))
WHERE jsonb_typeof(coalesce(provider_response -> 'media_urls', 'null'::jsonb)) = 'array';

UPDATE public.campaign_logs
SET provider_response = jsonb_set(provider_response, '{cached_media_urls}',
      public.dedupe_media_jsonb(provider_response -> 'cached_media_urls', coalesce(provider_response -> 'removed_media_keys', '[]'::jsonb)))
WHERE jsonb_typeof(coalesce(provider_response -> 'cached_media_urls', 'null'::jsonb)) = 'array';