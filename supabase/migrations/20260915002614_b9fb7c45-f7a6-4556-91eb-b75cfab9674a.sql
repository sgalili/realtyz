
-- 1. Central shared market pool
CREATE TABLE IF NOT EXISTS public.market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'yad2',
  external_id text,
  source_url text NOT NULL,
  deal_type text NOT NULL DEFAULT 'sale',
  title text,
  description text,
  address text,
  house_number text,
  apartment_number text,
  city text,
  neighborhood text,
  price numeric,
  rooms numeric,
  sqm numeric,
  floor integer,
  property_type text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  updated_at_source timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_listings TO authenticated;
GRANT ALL ON public.market_listings TO service_role;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_listings_select ON public.market_listings;
CREATE POLICY market_listings_select ON public.market_listings
  FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS market_listings_source_url_key
  ON public.market_listings (source_url);
CREATE UNIQUE INDEX IF NOT EXISTS market_listings_source_external_key
  ON public.market_listings (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_listings_city_deal_idx
  ON public.market_listings (city, deal_type, published_at DESC);
CREATE INDEX IF NOT EXISTS market_listings_first_seen_idx
  ON public.market_listings (first_seen_at DESC);

DROP TRIGGER IF EXISTS trg_market_listings_touch ON public.market_listings;
CREATE TRIGGER trg_market_listings_touch BEFORE UPDATE ON public.market_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Run log = rate-limit gate
CREATE TABLE IF NOT EXISTS public.market_scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'yad2',
  run_date date NOT NULL,
  slot text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  scraped_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  shared_count integer NOT NULL DEFAULT 0,
  error text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_scrape_runs_slot_check CHECK (slot IN ('morning','evening'))
);

GRANT SELECT ON public.market_scrape_runs TO authenticated;
GRANT ALL ON public.market_scrape_runs TO service_role;
ALTER TABLE public.market_scrape_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_scrape_runs_select ON public.market_scrape_runs;
CREATE POLICY market_scrape_runs_select ON public.market_scrape_runs
  FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS market_scrape_runs_slot_key
  ON public.market_scrape_runs (source, run_date, slot);
CREATE UNIQUE INDEX IF NOT EXISTS market_scrape_runs_token_key
  ON public.market_scrape_runs (token);

DROP TRIGGER IF EXISTS trg_market_scrape_runs_touch ON public.market_scrape_runs;
CREATE TRIGGER trg_market_scrape_runs_touch BEFORE UPDATE ON public.market_scrape_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Per-city incremental watermark
CREATE TABLE IF NOT EXISTS public.market_scrape_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'yad2',
  city text NOT NULL,
  deal_type text NOT NULL,
  watermark_published_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_new_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_scrape_state TO authenticated;
GRANT ALL ON public.market_scrape_state TO service_role;
ALTER TABLE public.market_scrape_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_scrape_state_select ON public.market_scrape_state;
CREATE POLICY market_scrape_state_select ON public.market_scrape_state
  FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS market_scrape_state_key
  ON public.market_scrape_state (source, city, deal_type);

DROP TRIGGER IF EXISTS trg_market_scrape_state_touch ON public.market_scrape_state;
CREATE TRIGGER trg_market_scrape_state_touch BEFORE UPDATE ON public.market_scrape_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Slot claim: only 08:00 and 18:00 Asia/Jerusalem, once each per local day
CREATE OR REPLACE FUNCTION public.claim_market_scrape_slot(_source text DEFAULT 'yad2')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _local timestamp := (now() AT TIME ZONE 'Asia/Jerusalem');
  _hour int := EXTRACT(HOUR FROM _local)::int;
  _slot text;
  _row public.market_scrape_runs;
BEGIN
  _slot := CASE WHEN _hour = 8 THEN 'morning' WHEN _hour = 18 THEN 'evening' ELSE NULL END;
  IF _slot IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'outside_window', 'local_hour', _hour);
  END IF;

  INSERT INTO public.market_scrape_runs (source, run_date, slot)
  VALUES (_source, _local::date, _slot)
  ON CONFLICT (source, run_date, slot) DO NOTHING
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_claimed', 'slot', _slot);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'slot', _slot, 'token', _row.token, 'run_id', _row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_market_scrape_slot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_market_scrape_slot(text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_market_scrape_run(
  _token uuid,
  _status text DEFAULT 'success',
  _scraped integer DEFAULT 0,
  _new_rows integer DEFAULT 0,
  _shared integer DEFAULT 0,
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.market_scrape_runs
     SET status = _status,
         scraped_count = _scraped,
         new_count = _new_rows,
         shared_count = _shared,
         error = _error,
         finished_at = now()
   WHERE token = _token;
$$;

REVOKE ALL ON FUNCTION public.finish_market_scrape_run(uuid, text, integer, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_market_scrape_run(uuid, text, integer, integer, integer, text) TO service_role;

-- 5. Share the central pool with every workspace covering the same cities
CREATE OR REPLACE FUNCTION public.share_market_listings(
  _since timestamptz DEFAULT (now() - interval '1 day'),
  _max_rows integer DEFAULT 3000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rita uuid := 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';
  _default_cities text[] := ARRAY['הרצליה','רמת השרון'];
  w record;
  m record;
  _cities text[];
  _shared integer := 0;
BEGIN
  FOR w IN
    SELECT p.id, p.service_areas
      FROM public.profiles p
     WHERE p.id <> _rita
  LOOP
    SELECT COALESCE(
             NULLIF(ARRAY(
               SELECT DISTINCT btrim(split_part(a, ' - ', 1))
                 FROM unnest(COALESCE(w.service_areas, ARRAY[]::text[])) AS a
                WHERE btrim(a) <> ''
             ), ARRAY[]::text[]),
             _default_cities
           )
      INTO _cities;

    FOR m IN
      SELECT *
        FROM public.market_listings ml
       WHERE ml.last_seen_at >= _since
         AND ml.city IS NOT NULL
         AND EXISTS (SELECT 1 FROM unnest(_cities) c WHERE btrim(c) = btrim(ml.city))
       ORDER BY ml.published_at DESC NULLS LAST
       LIMIT _max_rows
    LOOP
      UPDATE public.listings l
         SET asking_price = COALESCE(m.price, l.asking_price),
             media_photos = CASE WHEN jsonb_array_length(m.photos) > 0 THEN m.photos ELSE l.media_photos END,
             rooms = COALESCE(m.rooms, l.rooms),
             sqm = COALESCE(m.sqm, l.sqm),
             updated_at = now()
       WHERE l.source_url = m.source_url
         AND l.workspace_owner_id = w.id
         AND COALESCE(l.source_metadata->>'shared_from_pool', 'false') = 'true';

      IF NOT FOUND THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.listings l
           WHERE l.source_url = m.source_url AND l.workspace_owner_id = w.id
        ) THEN
          INSERT INTO public.listings (
            user_id, workspace_owner_id, property_title, description, slug,
            asking_price, rooms, sqm, floor, city, neighborhood, address,
            house_number, apartment_number, deal_type, source, source_url,
            external_id, media_photos, attributes, source_metadata, status
          ) VALUES (
            w.id, w.id,
            COALESCE(NULLIF(m.title, ''), 'מודעה מיד-2'),
            COALESCE(NULLIF(m.description, ''), COALESCE(m.title, '')),
            'yad2-' || COALESCE(NULLIF(m.external_id, ''), replace(m.id::text, '-', '')) || '-' || substr(replace(w.id::text, '-', ''), 1, 8),
            COALESCE(m.price, 0), m.rooms, m.sqm, m.floor, m.city, m.neighborhood, m.address,
            m.house_number, m.apartment_number, m.deal_type, m.source, m.source_url,
            m.external_id, m.photos, m.attributes,
            jsonb_build_object(
              'scraper', 'market-pool',
              'shared_from_pool', 'true',
              'market_listing_id', m.id,
              'external_id', m.external_id,
              'published_at', m.published_at,
              'shared_at', now()
            ),
            'live'
          )
          ON CONFLICT DO NOTHING;
          _shared := _shared + 1;
        END IF;
      ELSE
        _shared := _shared + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN _shared;
END;
$$;

REVOKE ALL ON FUNCTION public.share_market_listings(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_market_listings(timestamptz, integer) TO service_role;
