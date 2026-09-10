ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_gender_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_gender_check CHECK (gender IS NULL OR gender IN ('male','female'));
UPDATE public.leads SET gender = preferences->>'gender'
 WHERE gender IS NULL AND preferences->>'gender' IN ('male','female');