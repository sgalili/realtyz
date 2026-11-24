ALTER TABLE public.closing_documents DROP CONSTRAINT IF EXISTS closing_documents_template_key_check;
ALTER TABLE public.closing_documents ADD CONSTRAINT closing_documents_template_key_check
  CHECK (template_key = ANY (ARRAY['offer_letter','lease_agreement','tour_agreement','custom_upload']));
ALTER TABLE public.closing_documents
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_note text;

CREATE OR REPLACE FUNCTION public.approve_signed_document(_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.closing_documents;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO d FROM public.closing_documents WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.ws_current_access(d.workspace_owner_id) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.can_use_closing_room(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF d.status <> 'signed' OR d.signed_pdf_path IS NULL OR d.signed_at IS NULL THEN RAISE EXCEPTION 'not_signed'; END IF;
  IF d.approved_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'approved_at', d.approved_at); END IF;
  UPDATE public.closing_documents SET approved_at = now(), approved_by = auth.uid(), approval_note = nullif(left(trim(coalesce(_note,'')), 500), ''), updated_at = now() WHERE id = _id;
  RETURN jsonb_build_object('ok', true, 'approved_at', now());
END $$;
REVOKE ALL ON FUNCTION public.approve_signed_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_signed_document(uuid, text) TO authenticated;