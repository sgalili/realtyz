CREATE OR REPLACE FUNCTION public.ext_create_pairing(_label text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  _token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.extension_pairings (workspace_owner_id, created_by, token, label)
  VALUES (_uid, _uid, _token, _label)
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'token', _token);
END;
$$;