
-- 1. Sync configuration / status per broker
CREATE TABLE IF NOT EXISTS public.webtiv_sync_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  buyers_guid text,
  sellers_guid text,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webtiv_sync_state TO authenticated;
GRANT ALL ON public.webtiv_sync_state TO service_role;

ALTER TABLE public.webtiv_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage their webtiv sync state"
  ON public.webtiv_sync_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Dedup ledger
CREATE TABLE IF NOT EXISTS public.webtiv_synced_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('buyers','sellers')),
  serial text NOT NULL,
  phone text,
  email text,
  homely_status text,
  homely_serial text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, serial)
);

CREATE INDEX IF NOT EXISTS idx_webtiv_synced_user_phone ON public.webtiv_synced_records(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_webtiv_synced_user_email ON public.webtiv_synced_records(user_id, email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webtiv_synced_records TO authenticated;
GRANT ALL ON public.webtiv_synced_records TO service_role;

ALTER TABLE public.webtiv_synced_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read their webtiv sync ledger"
  ON public.webtiv_synced_records
  FOR SELECT
  USING (auth.uid() = user_id);

-- updated_at trigger for state table (reuse existing helper if present, otherwise inline)
CREATE OR REPLACE FUNCTION public.webtiv_sync_state_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webtiv_sync_state_touch ON public.webtiv_sync_state;
CREATE TRIGGER trg_webtiv_sync_state_touch
  BEFORE UPDATE ON public.webtiv_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.webtiv_sync_state_touch();
