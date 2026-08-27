ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_phone_number_key;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_phone_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique_idx ON public.leads (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '';