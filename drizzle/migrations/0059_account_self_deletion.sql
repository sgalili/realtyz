CREATE TABLE public.account_deletion_otps (user_id uuid PRIMARY KEY, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.account_deletion_otps TO service_role;
ALTER TABLE public.account_deletion_otps ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.deleted_accounts_archive (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, phone text, email text, full_name text, roles text[], profile jsonb, reason text NOT NULL DEFAULT 'self_request', deleted_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.deleted_accounts_archive TO authenticated;
GRANT ALL ON public.deleted_accounts_archive TO service_role;
ALTER TABLE public.deleted_accounts_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read deleted accounts" ON public.deleted_accounts_archive FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));