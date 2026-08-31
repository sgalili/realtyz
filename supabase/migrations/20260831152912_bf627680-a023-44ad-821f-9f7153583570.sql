ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS drip_stage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drip_last_sent_at timestamptz;