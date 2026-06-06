ALTER TABLE public.campaign_logs
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrics_updated_at timestamptz;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_logs';
  EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
  END;
END$$;

ALTER TABLE public.campaign_logs REPLICA IDENTITY FULL;