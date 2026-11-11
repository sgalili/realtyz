ALTER TABLE public.admin_broker_onboarding
  ADD COLUMN IF NOT EXISTS contact_status text NOT NULL DEFAULT 'complete' CHECK (contact_status IN ('pending_contact','complete')),
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS contact_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_completed_by uuid;
CREATE INDEX IF NOT EXISTS admin_broker_onboarding_pending_contact_idx ON public.admin_broker_onboarding(contact_status) WHERE contact_status='pending_contact';