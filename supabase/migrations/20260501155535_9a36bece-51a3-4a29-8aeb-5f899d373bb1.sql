ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_paused_reason text,
  ADD COLUMN IF NOT EXISTS ai_paused_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_ai_paused(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ai_paused FROM public.platform_settings WHERE user_id = _user_id),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_ai_paused(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_ai_paused(uuid) TO authenticated, service_role;