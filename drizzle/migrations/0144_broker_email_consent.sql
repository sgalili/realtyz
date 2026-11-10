ALTER TABLE public.admin_broker_onboarding
 ADD COLUMN IF NOT EXISTS email_consent_at timestamptz,
 ADD COLUMN IF NOT EXISTS email_consent_by uuid,
 ADD COLUMN IF NOT EXISTS email_consent_note text,
 ADD COLUMN IF NOT EXISTS email_unsubscribed_at timestamptz,
 ADD COLUMN IF NOT EXISTS email_invited_at timestamptz,
 ADD COLUMN IF NOT EXISTS email_message_id text,
 ADD COLUMN IF NOT EXISTS email_unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();