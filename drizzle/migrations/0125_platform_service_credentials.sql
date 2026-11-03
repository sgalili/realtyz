CREATE TABLE public.platform_service_credentials (
  key text PRIMARY KEY,
  value_encrypted text NOT NULL,
  last_check_status text,
  last_check_message text,
  last_checked_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Service-only: edge functions read/write it; the app never reads encrypted values.
GRANT ALL ON public.platform_service_credentials TO service_role;
REVOKE ALL ON public.platform_service_credentials FROM anon, authenticated;
ALTER TABLE public.platform_service_credentials ENABLE ROW LEVEL SECURITY;