CREATE TABLE public.global_ai_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 source_type text NOT NULL DEFAULT 'text',
 raw_text text NOT NULL,
 storage_path text NOT NULL UNIQUE,
 chunk_count integer NOT NULL DEFAULT 1,
 source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_ai_documents TO authenticated;
GRANT ALL ON public.global_ai_documents TO service_role;
ALTER TABLE public.global_ai_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage global training" ON public.global_ai_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins manage global training files" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'global-ai-training' AND public.has_role(auth.uid(), 'super_admin')) WITH CHECK (bucket_id = 'global-ai-training' AND public.has_role(auth.uid(), 'super_admin'));