DO $m$ DECLARE d text; BEGIN
 d := pg_get_functiondef('public.start_broker_signup_grace'::regproc);
 d := replace(d, 'UPDATE public.workspace_memberships SET account_type = ''real_estate'' WHERE user_id = uid AND workspace_owner_id = uid;',
  'UPDATE public.workspace_memberships SET account_type = ''real_estate'', workspace_name = CASE WHEN NULLIF(btrim(COALESCE(workspace_name,'''')),'''') IS NULL OR workspace_name = (SELECT full_name FROM public.profiles WHERE id = uid) THEN left(btrim(_details->>''office_name''),200) ELSE workspace_name END WHERE user_id = uid AND workspace_owner_id = uid;');
 IF position('workspace_name = CASE' IN d)=0 THEN RAISE EXCEPTION 'patch_failed'; END IF;
 EXECUTE d;
END $m$;
UPDATE public.workspace_memberships m SET workspace_name = left(btrim(p.signup_details->>'office_name'),200), updated_at = now()
FROM public.profiles p
WHERE m.user_id = p.id AND m.workspace_owner_id = p.id AND p.primary_user_type = 'broker'
  AND NULLIF(btrim(COALESCE(p.signup_details->>'office_name','')),'') IS NOT NULL
  AND (NULLIF(btrim(COALESCE(m.workspace_name,'')),'') IS NULL OR m.workspace_name = p.full_name);