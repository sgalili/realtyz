DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='listings' AND column_name='sqm') = 'integer' THEN
    ALTER TABLE public.listings ALTER COLUMN sqm TYPE numeric USING sqm::numeric;
  END IF;
END $$;