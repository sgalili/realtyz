CREATE TABLE public.lead_first_whatsapp_claims (
 workspace_owner_id uuid NOT NULL,
 phone_number text NOT NULL,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed','unknown')),
 message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_owner_id, phone_number)
);
GRANT ALL ON public.lead_first_whatsapp_claims TO service_role;
REVOKE ALL ON public.lead_first_whatsapp_claims FROM anon, authenticated;
ALTER TABLE public.lead_first_whatsapp_claims ENABLE ROW LEVEL SECURITY;