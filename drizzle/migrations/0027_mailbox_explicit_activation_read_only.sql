CREATE OR REPLACE FUNCTION public.get_workspace_mailbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := public.current_workspace_owner();
BEGIN
  IF auth.uid() IS NULL OR NOT public.ws_current_access(v_owner) THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object(
    'owner_id', v_owner, 'alias', nullif(p.email_alias,''),
    'address', CASE WHEN nullif(p.email_alias,'') IS NOT NULL THEN p.email_alias || '@realtyz.co.il' END,
    'gmail_connected', EXISTS (SELECT 1 FROM public.social_connections s WHERE s.created_by = v_owner AND s.platform IN ('gmail','google') AND s.is_connected = true),
    'provider', coalesce(p.email_provider,'gmail'), 'is_owner', v_owner = auth.uid()
  ) FROM public.profiles p WHERE p.id = v_owner);
END $$;
CREATE OR REPLACE FUNCTION public.set_workspace_email_alias(p_alias text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := public.current_workspace_owner(); v_clean text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_owner IS NULL OR NOT public.ws_current_access(v_owner) THEN RAISE EXCEPTION 'no_workspace'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'only_workspace_owner'; END IF;
  v_clean := regexp_replace(lower(coalesce(p_alias,'')), '[^a-z0-9._-]', '', 'g');
  v_clean := left(regexp_replace(v_clean, '^[._-]+|[._-]+$', '', 'g'), 32);
  IF length(v_clean) < 2 THEN RAISE EXCEPTION 'alias_too_short'; END IF;
  IF v_clean IN ('info','noreply','no-reply','admin','support','postmaster','abuse','notify','billing','security','webmaster','hostmaster','mailer-daemon') THEN RAISE EXCEPTION 'alias_reserved'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email_alias = v_clean AND id <> v_owner) THEN RAISE EXCEPTION 'alias_taken'; END IF;
  UPDATE public.profiles SET email_alias = v_clean, direct_channels = coalesce(direct_channels,'{}'::jsonb) || '{"email":true}'::jsonb WHERE id = v_owner;
  RETURN v_clean || '@realtyz.co.il';
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_mailbox() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_workspace_email_alias(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_mailbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_email_alias(text) TO authenticated;