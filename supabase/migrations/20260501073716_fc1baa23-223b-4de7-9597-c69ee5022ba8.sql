ALTER TABLE public.agent_personas
  ADD COLUMN IF NOT EXISTS style_calibration jsonb,
  ADD COLUMN IF NOT EXISTS style_calibration_updated_at timestamptz;