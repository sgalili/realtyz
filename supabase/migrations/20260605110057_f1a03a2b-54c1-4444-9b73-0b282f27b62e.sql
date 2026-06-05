ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS yad2_api_key text,
  ADD COLUMN IF NOT EXISTS yad2_username text,
  ADD COLUMN IF NOT EXISTS madlan_api_key text,
  ADD COLUMN IF NOT EXISTS madlan_username text;