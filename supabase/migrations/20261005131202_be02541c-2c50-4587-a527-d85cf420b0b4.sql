CREATE OR REPLACE FUNCTION public.get_effective_meta_page(_owner uuid)
 RETURNS TABLE(page_id text, page_name text, page_avatar_url text, has_token boolean, is_shared boolean, owner_id uuid)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR _owner IS NULL OR NOT public.can_access_workspace_owner(_owner) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT b.page_id::text, b.page_name::text, b.page_avatar_url::text,
         length(COALESCE(b.page_access_token, '')) > 30, false, b.owner_id
    FROM public.messenger_page_bindings b
   WHERE b.owner_id = _owner
   ORDER BY COALESCE(b.is_selected, false) DESC, b.updated_at DESC
   LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_integrations()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _fb jsonb := 'null'::jsonb;
  _wa_phone text; _green_phone text; _green boolean := false; _yad2 boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('facebook', null, 'wa_phone', null, 'green_phone', null,
                              'green_connected', false, 'yad2_connected', false);
  END IF;
  SELECT COALESCE(p.active_workspace_owner_id, _uid) INTO _owner FROM public.profiles p WHERE p.id = _uid;
  _owner := COALESCE(_owner, _uid);
  IF NOT public.can_access_workspace_owner(_owner) THEN _owner := _uid; END IF;

  SELECT jsonb_build_object('page_id', b.page_id, 'page_name', b.page_name,
           'page_avatar_url', b.page_avatar_url,
           'has_token', length(COALESCE(b.page_access_token, '')) > 30, 'is_shared', false)
    INTO _fb FROM public.messenger_page_bindings b
   WHERE b.owner_id = _owner ORDER BY b.updated_at DESC LIMIT 1;

  SELECT NULLIF(COALESCE(p.config->>'display_phone_number', p.config->>'phone_number'), '')
    INTO _wa_phone FROM public.wa_providers p
   WHERE p.user_id = _owner
     AND COALESCE(p.config->>'display_phone_number', p.config->>'phone_number') IS NOT NULL
   ORDER BY p.updated_at DESC LIMIT 1;

  SELECT COALESCE(c.is_connected, false), NULLIF(COALESCE(c.credentials->>'phone', c.credentials->>'wid'), '')
    INTO _green, _green_phone FROM public.social_connections c
   WHERE c.platform = 'whatsapp_green' AND c.workspace_owner_id = _owner
   ORDER BY c.updated_at DESC LIMIT 1;

  SELECT EXISTS (SELECT 1 FROM public.user_api_keys k WHERE k.user_id = _owner
      AND (COALESCE(k.yad2_api_key, '') <> '' OR COALESCE(k.brightdata_api_token, '') <> '')) INTO _yad2;

  RETURN jsonb_build_object('facebook', _fb, 'wa_phone', _wa_phone, 'green_phone', _green_phone,
    'green_connected', COALESCE(_green, false), 'yad2_connected', COALESCE(_yad2, false));
END;
$$;