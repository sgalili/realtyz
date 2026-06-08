
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female') OR gender IS NULL);
ALTER TABLE public.cloned_voices ADD COLUMN IF NOT EXISTS voice_gender text CHECK (voice_gender IN ('male','female') OR voice_gender IS NULL);
COMMENT ON COLUMN public.profiles.gender IS 'Hebrew grammatical gender for the broker, used to address them as male/female across UI and voice agents';
COMMENT ON COLUMN public.cloned_voices.voice_gender IS 'Gender of the cloned voice persona — the AI must self-refer with this gender on every call';
