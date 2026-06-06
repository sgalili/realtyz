DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_logs;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_events;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.campaign_logs REPLICA IDENTITY FULL;
ALTER TABLE public.engagement_events REPLICA IDENTITY FULL;