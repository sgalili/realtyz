ALTER TABLE public.messenger_page_bindings
  ADD COLUMN IF NOT EXISTS is_platform_shared boolean NOT NULL DEFAULT false;

UPDATE public.messenger_page_bindings
   SET is_platform_shared = true
 WHERE page_id = '729806313557785';

CREATE OR REPLACE FUNCTION public.get_effective_meta_page()
RETURNS TABLE(page_id text, page_name text, page_avatar_url text, has_token boolean, is_shared boolean, owner_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.page_id::text, b.page_name::text, b.page_avatar_url::text,
         length(COALESCE(b.page_access_token, '')) > 30, true, b.owner_id
    FROM public.messenger_page_bindings b
   WHERE b.is_platform_shared = true
   ORDER BY b.updated_at DESC
   LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_meta_page() TO authenticated;