CREATE OR REPLACE FUNCTION public.get_workspace_mailbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := public.current_workspace_owner();
  v_alias text; v_name text; v_email text; v_base text; v_try text; n int := 1;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT email_alias, full_name INTO v_alias, v_name FROM public.profiles WHERE id = v_owner;
  IF coalesce(v_alias,'') = '' THEN
    v_base := lower(regexp_replace(split_part(coalesce(v_name,''),' ',1), '[^a-zA-Z0-9]', '', 'g'));
    IF length(v_base) < 2 THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_owner;
      v_base := lower(regexp_replace(split_part(split_part(coalesce(v_email,''),'@',1),'.',1), '[^a-zA-Z0-9]', '', 'g'));
    END IF;
    IF length(v_base) < 2 THEN v_base := 'ws' || substr(replace(v_owner::text,'-',''),1,6); END IF;
    v_base := left(v_base, 28);
    IF v_base IN ('info','noreply','admin','support','postmaster','abuse','notify','billing','security','webmaster','hostmaster') THEN v_base := v_base || 'ws'; END IF;
    v_try := v_base;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE email_alias = v_try AND id <> v_owner) LOOP
      n := n + 1; v_try := v_base || n;
    END LOOP;
    UPDATE public.profiles SET email_alias = v_try,
      direct_channels = coalesce(direct_channels,'{}'::jsonb) || '{"email":true}'::jsonb
      WHERE id = v_owner;
    v_alias := v_try;
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'owner_id', v_owner,
      'alias', p.email_alias,
      'address', p.email_alias || '@realtyz.co.il',
      'gmail_connected', EXISTS (SELECT 1 FROM public.social_connections s WHERE s.created_by = v_owner AND s.platform IN ('gmail','google') AND s.is_connected = true),
      'provider', coalesce(p.email_provider, 'gmail'),
      'is_owner', v_owner = auth.uid()
    ) FROM public.profiles p WHERE p.id = v_owner
  );
END $$;
REVOKE ALL ON FUNCTION public.get_workspace_mailbox() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_mailbox() TO authenticated;