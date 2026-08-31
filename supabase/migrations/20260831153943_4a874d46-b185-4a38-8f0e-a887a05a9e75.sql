ALTER TABLE public.autopilot_queue
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS template_variables jsonb NOT NULL DEFAULT '[]'::jsonb;