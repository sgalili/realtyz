CREATE OR REPLACE FUNCTION public.get_effective_meta_page()
 RETURNS TABLE(page_id text, page_name text, page_avatar_url text, has_token boolean, is_shared boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(p.active_workspace_owner_id, _uid) INTO _owner
    FROM public.profiles p WHERE p.id = _uid;
  _owner := COALESCE(_owner, _uid);

  RETURN QUERY
  SELECT b.page_id::text, b.page_name::text, b.page_avatar_url::text,
         length(COALESCE(b.page_access_token, '')) > 30, false, b.owner_id
    FROM public.messenger_page_bindings b
   WHERE b.owner_id = _owner
   ORDER BY b.updated_at DESC
   LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_account_integrations()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owners uuid[];
  _fb jsonb := 'null'::jsonb;
  _owner uuid;
  _wa_phone text;
  _green_phone text;
  _green boolean := false;
  _yad2 boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('facebook', null, 'wa_phone', null, 'green_phone', null,
                              'green_connected', false, 'yad2_connected', false);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT o), ARRAY[_uid]) INTO _owners
    FROM (
      SELECT _uid AS o
      UNION SELECT m.workspace_owner_id FROM public.workspace_memberships m WHERE m.user_id = _uid
    ) s;

  SELECT COALESCE(p.active_workspace_owner_id, _uid) INTO _owner
    FROM public.profiles p WHERE p.id = _uid;
  _owner := COALESCE(_owner, _uid);

  SELECT jsonb_build_object(
           'page_id', b.page_id,
           'page_name', b.page_name,
           'page_avatar_url', b.page_avatar_url,
           'has_token', length(COALESCE(b.page_access_token, '')) > 30,
           'is_shared', false)
    INTO _fb
    FROM public.messenger_page_bindings b
   WHERE b.owner_id = _owner
   ORDER BY b.updated_at DESC
   LIMIT 1;

  SELECT NULLIF(COALESCE(p.config->>'display_phone_number', p.config->>'phone_number'), '')
    INTO _wa_phone
    FROM public.wa_providers p
   WHERE COALESCE(p.config->>'display_phone_number', p.config->>'phone_number') IS NOT NULL
   ORDER BY (p.user_id = _uid) DESC, p.updated_at DESC
   LIMIT 1;

  SELECT COALESCE(c.is_connected, false),
         NULLIF(COALESCE(c.credentials->>'phone', c.credentials->>'wid'), '')
    INTO _green, _green_phone
    FROM public.social_connections c
   WHERE c.platform = 'whatsapp_green'
   ORDER BY (c.created_by = _uid) DESC, c.updated_at DESC
   LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.user_api_keys k
     WHERE k.user_id = ANY(_owners)
       AND (COALESCE(k.yad2_api_key, '') <> '' OR COALESCE(k.brightdata_api_token, '') <> '')
  ) INTO _yad2;

  RETURN jsonb_build_object(
    'facebook', _fb,
    'wa_phone', _wa_phone,
    'green_phone', _green_phone,
    'green_connected', COALESCE(_green, false),
    'yad2_connected', COALESCE(_yad2, false));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_effective_meta_page() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_integrations() TO authenticated;