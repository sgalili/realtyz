DROP POLICY IF EXISTS "Workspace members can view owner profile" ON public.profiles;
CREATE POLICY "Workspace members can view owner profile"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_workspace_member(id, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.update_workspace_profile(
  _owner uuid,
  _full_name text,
  _email text,
  _phone text,
  _city text,
  _gender text,
  _broker_license_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    _owner = auth.uid()
    OR public.is_workspace_member(_owner, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'workspace_access_denied';
  END IF;

  UPDATE public.profiles
  SET full_name = NULLIF(btrim(_full_name), ''),
      email = NULLIF(btrim(_email), ''),
      phone = NULLIF(btrim(_phone), ''),
      city = NULLIF(btrim(_city), ''),
      gender = NULLIF(btrim(_gender), ''),
      broker_license_number = NULLIF(btrim(_broker_license_number), ''),
      updated_at = now()
  WHERE id = _owner;
END;
$$;

REVOKE ALL ON FUNCTION public.update_workspace_profile(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_workspace_profile(uuid, text, text, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_workspace_profile_avatar(_owner uuid, _avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    _owner = auth.uid()
    OR public.is_workspace_member(_owner, auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'workspace_access_denied';
  END IF;

  UPDATE public.profiles
  SET avatar_url = NULLIF(btrim(_avatar_url), ''), updated_at = now()
  WHERE id = _owner;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_profile_avatar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_workspace_profile_avatar(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "avatars_select_workspace" ON storage.objects;
CREATE POLICY "avatars_select_workspace"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "avatars_insert_workspace" ON storage.objects;
CREATE POLICY "avatars_insert_workspace"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "avatars_update_workspace" ON storage.objects;
CREATE POLICY "avatars_update_workspace"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'avatars'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "avatars_delete_workspace" ON storage.objects;
CREATE POLICY "avatars_delete_workspace"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);