-- 1) Extend ayrshare_social_accounts to hold per-page metadata
ALTER TABLE public.ayrshare_social_accounts
  ADD COLUMN IF NOT EXISTS account_ref text,
  ADD COLUMN IF NOT EXISTS account_username text,
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS profile_key text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

-- Backfill account_ref for existing rows so the new unique constraint can be added
UPDATE public.ayrshare_social_accounts
  SET account_ref = COALESCE(account_ref, 'default:' || platform)
  WHERE account_ref IS NULL;

ALTER TABLE public.ayrshare_social_accounts
  ALTER COLUMN account_ref SET NOT NULL;

-- Swap unique constraint to support multiple pages per platform per user
ALTER TABLE public.ayrshare_social_accounts
  DROP CONSTRAINT IF EXISTS ayrshare_social_accounts_user_id_platform_key;

ALTER TABLE public.ayrshare_social_accounts
  ADD CONSTRAINT ayrshare_social_accounts_user_platform_ref_key
  UNIQUE (user_id, platform, account_ref);

-- 2) Allow inbound email messages from resend-inbound-webhook
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_platform_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_platform_check
  CHECK (platform = ANY (ARRAY[
    'whatsapp'::text, 'sms'::text, 'instagram'::text, 'telegram'::text,
    'messenger'::text, 'tiktok'::text, 'email'::text, 'facebook'::text, 'linkedin'::text
  ]));