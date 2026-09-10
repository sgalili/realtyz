CREATE OR REPLACE FUNCTION public.register_as_broker(_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _has_any boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid) INTO _has_any;

  IF NOT _has_any THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, 'agent'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _display_name IS NOT NULL AND btrim(_display_name) <> '' THEN
    UPDATE public.profiles
       SET full_name = COALESCE(NULLIF(btrim(full_name), ''), btrim(_display_name))
     WHERE id = _uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', 'agent', 'granted', NOT _has_any);
END;
$$;

REVOKE ALL ON FUNCTION public.register_as_broker(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_as_broker(text) TO authenticated;