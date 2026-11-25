CREATE TABLE public.admin_account_notes (
  user_id uuid PRIMARY KEY,
  note text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_account_notes TO authenticated;
GRANT ALL ON public.admin_account_notes TO service_role;
ALTER TABLE public.admin_account_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage account notes" ON public.admin_account_notes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));