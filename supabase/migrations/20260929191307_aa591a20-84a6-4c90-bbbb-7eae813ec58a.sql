CREATE OR REPLACE FUNCTION public.set_workspace_email_alias(p_alias text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid := public.current_workspace_owner(); v_clean text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'no_workspace'; END IF;
  v_clean := regexp_replace(lower(coalesce(p_alias,'')), '[^a-z0-9._-]', '', 'g');
  v_clean := left(regexp_replace(v_clean, '^[._-]+|[._-]+$', '', 'g'), 32);
  IF length(v_clean) < 2 THEN RAISE EXCEPTION 'alias_too_short'; END IF;
  IF v_clean IN ('info','noreply','no-reply','admin','support','postmaster','abuse','notify','billing','security','webmaster','hostmaster','mailer-daemon') THEN
    RAISE EXCEPTION 'alias_reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email_alias = v_clean AND id <> v_owner) THEN
    RAISE EXCEPTION 'alias_taken';
  END IF;
  UPDATE public.profiles SET email_alias = v_clean,
         direct_channels = coalesce(direct_channels,'{}'::jsonb) || '{"email":true}'::jsonb
   WHERE id = v_owner;
  RETURN v_clean || '@realtyz.co.il';
END $function$;