CREATE TABLE public.cloned_voices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  voice_id text NOT NULL,
  provider text NOT NULL DEFAULT 'elevenlabs',
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','voice_id')),
  preview_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, voice_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloned_voices TO authenticated;
GRANT ALL ON public.cloned_voices TO service_role;

ALTER TABLE public.cloned_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cloned_voices"
  ON public.cloned_voices
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_cloned_voices_updated_at
  BEFORE UPDATE ON public.cloned_voices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();