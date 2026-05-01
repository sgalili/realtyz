-- ============================================================================
-- CLOSING DOCUMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.closing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  listing_id uuid,
  template_key text NOT NULL CHECK (template_key IN ('offer_letter','lease_agreement')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','signed','expired','cancelled')),
  pdf_path text,
  signed_pdf_path text,
  sign_token text NOT NULL UNIQUE,
  signer_name text,
  signature_data text, -- base64 PNG of drawn signature
  fields jsonb NOT NULL DEFAULT '{}'::jsonb, -- prospect_name, property, price, terms, etc.
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  reminder_sent_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closing_documents_lead ON public.closing_documents(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closing_documents_user ON public.closing_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_closing_documents_status_sent ON public.closing_documents(status, sent_at) WHERE status = 'sent';

ALTER TABLE public.closing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or team manages closing_documents"
  ON public.closing_documents FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid()));

CREATE TRIGGER trg_closing_documents_updated
  BEFORE UPDATE ON public.closing_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- STORAGE BUCKET (private)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('closing-docs', 'closing-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Owners read their own docs; admins read all. The signer flow uses a service-role edge function.
CREATE POLICY "Team reads closing-docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'closing-docs' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team uploads closing-docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'closing-docs' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team updates closing-docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'closing-docs' AND public.is_team_member(auth.uid()));

CREATE POLICY "Team deletes closing-docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'closing-docs' AND public.is_team_member(auth.uid()));