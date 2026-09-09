ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_phone_number_key;
DROP INDEX IF EXISTS public.leads_phone_number_key;
DROP INDEX IF EXISTS public.leads_phone_number_unique_idx;
DROP INDEX IF EXISTS public.leads_email_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS leads_owner_phone_unique_idx
  ON public.leads (assigned_to, btrim(phone_number))
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS leads_owner_email_unique_idx
  ON public.leads (assigned_to, lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';