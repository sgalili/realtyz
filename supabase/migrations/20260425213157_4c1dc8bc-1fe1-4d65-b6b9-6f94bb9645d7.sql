ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS encrypted_session text,
  ADD COLUMN IF NOT EXISTS session_method text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz;