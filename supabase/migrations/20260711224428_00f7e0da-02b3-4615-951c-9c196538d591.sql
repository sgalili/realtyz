ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS messenger_psid text,
  ADD COLUMN IF NOT EXISTS instagram_psid text;

CREATE INDEX IF NOT EXISTS leads_messenger_psid_idx ON public.leads (messenger_psid) WHERE messenger_psid IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_instagram_psid_idx ON public.leads (instagram_psid) WHERE instagram_psid IS NOT NULL;