ALTER TABLE public.property_tours REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.property_tours;