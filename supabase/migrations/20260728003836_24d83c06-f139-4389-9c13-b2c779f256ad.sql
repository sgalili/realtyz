ALTER TABLE public.crm_profiles
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_checked_at timestamptz;