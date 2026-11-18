CREATE TABLE public.invitation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
GRANT SELECT, INSERT ON public.invitation_attachments TO authenticated;
GRANT ALL ON public.invitation_attachments TO service_role;
ALTER TABLE public.invitation_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read attachments" ON public.invitation_attachments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins add attachments" ON public.invitation_attachments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND created_by = auth.uid());
CREATE POLICY "Super admins upload invitation files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invitation-attachments' AND public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins read invitation files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invitation-attachments' AND public.has_role(auth.uid(), 'super_admin'));