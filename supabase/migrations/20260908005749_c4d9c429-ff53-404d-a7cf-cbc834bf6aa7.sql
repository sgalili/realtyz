ALTER TABLE public.fb_personal_connections
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS fb_personal_connections_id_key
  ON public.fb_personal_connections (id);