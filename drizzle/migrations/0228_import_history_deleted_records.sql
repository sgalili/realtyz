CREATE TABLE public.import_history_deleted_records (
  record_key text PRIMARY KEY,
  deleted_by uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_history_deleted_records TO authenticated;
GRANT ALL ON public.import_history_deleted_records TO service_role;
ALTER TABLE public.import_history_deleted_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read deleted import entries" ON public.import_history_deleted_records FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Super admins remove import entries" ON public.import_history_deleted_records FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role) AND deleted_by = auth.uid());