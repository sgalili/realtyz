ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'gmail' CHECK (email_provider IN ('gmail','realtyz'));

CREATE OR REPLACE FUNCTION public.get_workspace_mailbox()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'owner_id', o.id,
    'alias', p.email_alias,
    'address', CASE WHEN p.email_alias IS NOT NULL AND p.email_alias <> '' THEN p.email_alias || '@realtyz.co.il' END,
    'gmail_connected', EXISTS (SELECT 1 FROM public.social_connections s WHERE s.created_by = o.id AND s.platform IN ('gmail','google') AND s.is_connected = true),
    'provider', coalesce(p.email_provider, 'gmail'),
    'is_owner', o.id = auth.uid()
  )
  FROM (SELECT public.current_workspace_owner() AS id) o
  LEFT JOIN public.profiles p ON p.id = o.id
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_email_provider(p_provider text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := public.current_workspace_owner();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'only_workspace_owner'; END IF;
  IF p_provider NOT IN ('gmail','realtyz') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  UPDATE public.profiles SET email_provider = p_provider WHERE id = v_owner;
  RETURN p_provider;
END $$;

REVOKE ALL ON FUNCTION public.set_workspace_email_provider(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_email_provider(text) TO authenticated;