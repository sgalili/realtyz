CREATE UNIQUE INDEX IF NOT EXISTS campaign_logs_user_provider_message_unique
ON public.campaign_logs (user_id, provider_message_id);

CREATE OR REPLACE FUNCTION public.is_ai_autopilot_enabled(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enable_ai_autopilot FROM public.platform_settings WHERE user_id = _user_id),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ai_autopilot_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ai_autopilot_enabled(uuid) TO service_role;