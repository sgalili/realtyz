CREATE TABLE public.broker_import_scrape_cache (
  cache_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('search_page','item_detail')),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.broker_import_scrape_cache TO service_role;
ALTER TABLE public.broker_import_scrape_cache ENABLE ROW LEVEL SECURITY;
-- Service-only: no client policies. Raw scraped data never reaches the browser.
CREATE INDEX broker_import_scrape_cache_fetched_idx ON public.broker_import_scrape_cache(fetched_at);
COMMENT ON TABLE public.broker_import_scrape_cache IS 'Bright Data search/detail results for Super Admin broker imports; freshness is fetched_at only (reads never extend it).';