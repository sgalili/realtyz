ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS brightdata_api_token text,
  ADD COLUMN IF NOT EXISTS brightdata_zone text;