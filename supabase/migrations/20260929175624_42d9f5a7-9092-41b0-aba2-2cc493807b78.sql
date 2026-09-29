CREATE OR REPLACE FUNCTION public.get_workspace_mailbox()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'owner_id', o.id,
    'alias', p.email_alias,
    'address', CASE WHEN p.email_alias IS NOT NULL AND p.email_alias <> '' THEN p.email_alias || '@realtyz.co.il' END,
    'gmail_connected', EXISTS (SELECT 1 FROM public.social_connections s WHERE s.created_by = o.id AND s.platform IN ('gmail','google') AND s.is_connected = true),
    'is_owner', o.id = auth.uid()
  )
  FROM (SELECT public.current_workspace_owner() AS id) o
  LEFT JOIN public.profiles p ON p.id = o.id
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_email_alias(p_alias text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := public.current_workspace_owner(); v_clean text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'only_workspace_owner'; END IF;
  v_clean := regexp_replace(lower(coalesce(p_alias,'')), '[^a-z0-9._-]', '', 'g');
  v_clean := left(regexp_replace(v_clean, '^[._-]+|[._-]+$', '', 'g'), 32);
  IF length(v_clean) < 2 THEN RAISE EXCEPTION 'alias_too_short'; END IF;
  IF v_clean IN ('info','noreply','no-reply','admin','support','postmaster','abuse','notify','billing','security','webmaster','hostmaster','mailer-daemon') THEN
    RAISE EXCEPTION 'alias_reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email_alias = v_clean AND id <> v_owner) THEN
    RAISE EXCEPTION 'alias_taken';
  END IF;
  UPDATE public.profiles
     SET email_alias = v_clean,
         direct_channels = coalesce(direct_channels,'{}'::jsonb) || '{"email":true}'::jsonb
   WHERE id = v_owner;
  RETURN v_clean || '@realtyz.co.il';
END $$;

REVOKE ALL ON FUNCTION public.get_workspace_mailbox() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_workspace_email_alias(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_mailbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_email_alias(text) TO authenticated;