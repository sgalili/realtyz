ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_event_link text;