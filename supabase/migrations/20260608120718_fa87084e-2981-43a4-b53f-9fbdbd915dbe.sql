ALTER TABLE public.ai_content_logs
  ADD COLUMN IF NOT EXISTS media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();