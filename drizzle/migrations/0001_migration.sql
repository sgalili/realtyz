CREATE TABLE public.inquiry_guard_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  device_id text,
  ip_hash text,
  listing_id uuid,
  city text,
  action text NOT NULL DEFAULT 'register',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inquiry_guard_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  device_id text,
  ip_hash text,
  cities text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  cleared_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inquiry_guard_events TO service_role;
GRANT ALL ON public.inquiry_guard_challenges TO service_role;
ALTER TABLE public.inquiry_guard_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_guard_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.inquiry_guard_events (phone, created_at DESC);
CREATE INDEX ON public.inquiry_guard_events (device_id, created_at DESC);
CREATE INDEX ON public.inquiry_guard_events (ip_hash, created_at DESC);
CREATE INDEX ON public.inquiry_guard_challenges (phone, created_at DESC);
CREATE INDEX ON public.inquiry_guard_challenges (device_id, created_at DESC);