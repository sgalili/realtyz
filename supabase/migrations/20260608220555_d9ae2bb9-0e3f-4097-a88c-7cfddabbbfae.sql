CREATE UNIQUE INDEX IF NOT EXISTS ayrshare_social_accounts_user_platform_ref_unique
  ON public.ayrshare_social_accounts (user_id, platform, account_ref)
  WHERE account_ref IS NOT NULL;