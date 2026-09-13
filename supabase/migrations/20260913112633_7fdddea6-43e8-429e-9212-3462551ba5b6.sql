ALTER TABLE public.closing_documents DROP CONSTRAINT IF EXISTS closing_documents_template_key_check;
ALTER TABLE public.closing_documents ADD CONSTRAINT closing_documents_template_key_check
  CHECK (template_key IN ('offer_letter','lease_agreement','tour_agreement'));