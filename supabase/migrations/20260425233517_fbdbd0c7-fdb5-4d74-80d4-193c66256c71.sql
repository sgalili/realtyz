-- Enable realtime for the activity log so the Social Connect hub can subscribe
-- to live INSERTs and update per-platform 24h counters without polling.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'interaction_activity_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.interaction_activity_log';
  END IF;
END$$;

ALTER TABLE public.interaction_activity_log REPLICA IDENTITY FULL;