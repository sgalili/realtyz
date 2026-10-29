CREATE TABLE public.broker_certificate_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','matched','mismatch','unreadable','failed','blocked')),
 license_number text,
 certificate_name text,
 registry_name text,
 safe_message text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broker_certificate_checks TO authenticated;
GRANT ALL ON public.broker_certificate_checks TO service_role;
ALTER TABLE public.broker_certificate_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own document checks" ON public.broker_certificate_checks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX broker_certificate_checks_user_time ON public.broker_certificate_checks(user_id, created_at DESC);
COMMENT ON TABLE public.broker_certificate_checks IS 'Document consistency checks only; never authorizes broker roles, identity or closing entitlements. Uploaded images are not stored.';