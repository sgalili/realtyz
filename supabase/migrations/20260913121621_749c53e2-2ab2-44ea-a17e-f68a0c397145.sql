CREATE OR REPLACE FUNCTION public.save_workspace_office(
  _workspace_owner_id uuid,
  _agency_name text,
  _logo_url text,
  _landscape_logo_url text,
  _service_areas text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _allowed boolean := false;
  _clean_areas text[];
BEGIN
  IF _caller IS NULL OR _workspace_owner_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT (
    _caller = _workspace_owner_id
    OR EXISTS (
      SELECT 1
      FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id = _workspace_owner_id
        AND wm.user_id = _caller
    )
    OR public.has_role(_caller, 'super_admin'::public.app_role)
  ) INTO _allowed;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'workspace_forbidden';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT trimmed_area ORDER BY trimmed_area), ARRAY[]::text[])
  INTO _clean_areas
  FROM (
    SELECT btrim(area) AS trimmed_area
    FROM unnest(COALESCE(_service_areas, ARRAY[]::text[])) AS area
    WHERE btrim(area) <> ''
  ) cleaned;

  INSERT INTO public.white_label_settings (
    user_id,
    agency_name,
    logo_url,
    landscape_logo_url
  ) VALUES (
    _workspace_owner_id,
    NULLIF(btrim(_agency_name), ''),
    NULLIF(btrim(_logo_url), ''),
    NULLIF(btrim(_landscape_logo_url), '')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    agency_name = EXCLUDED.agency_name,
    logo_url = EXCLUDED.logo_url,
    landscape_logo_url = EXCLUDED.landscape_logo_url,
    updated_at = now();

  UPDATE public.profiles
  SET service_areas = _clean_areas,
      updated_at = now()
  WHERE id = _workspace_owner_id;

  RETURN jsonb_build_object(
    'ok', true,
    'workspace_owner_id', _workspace_owner_id,
    'service_areas', to_jsonb(_clean_areas)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_workspace_office(uuid, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_workspace_office(uuid, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_workspace_office(uuid, text, text, text, text[]) TO service_role;

DROP POLICY IF EXISTS "Workspace members upload agency logos" ON storage.objects;
CREATE POLICY "Workspace members upload agency logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'agency-logos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Workspace members update agency logos" ON storage.objects;
CREATE POLICY "Workspace members update agency logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'agency-logos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'agency-logos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Workspace members delete agency logos" ON storage.objects;
CREATE POLICY "Workspace members delete agency logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'agency-logos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Workspace members list agency logos" ON storage.objects;
CREATE POLICY "Workspace members list agency logos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'agency-logos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_owner_id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);