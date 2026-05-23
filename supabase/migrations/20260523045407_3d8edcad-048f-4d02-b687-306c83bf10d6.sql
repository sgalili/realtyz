CREATE TABLE IF NOT EXISTS public.market_pulse_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (source, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_market_pulse_cache_lookup
  ON public.market_pulse_cache (source, cache_key, expires_at);

ALTER TABLE public.market_pulse_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cache"
  ON public.market_pulse_cache
  FOR SELECT
  TO authenticated
  USING (true);
