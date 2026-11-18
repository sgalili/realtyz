CREATE TABLE public.broker_invitation_emails (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), broker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, created_by uuid, to_email text NOT NULL, subject text NOT NULL, body_text text NOT NULL, links jsonb NOT NULL DEFAULT '[]'::jsonb, is_demo boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'sent', message_id text, error text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.broker_invitation_emails TO authenticated;
GRANT ALL ON public.broker_invitation_emails TO service_role;
ALTER TABLE public.broker_invitation_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_invitation_emails_admin_read ON public.broker_invitation_emails FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX broker_invitation_emails_created_idx ON public.broker_invitation_emails(created_at DESC);