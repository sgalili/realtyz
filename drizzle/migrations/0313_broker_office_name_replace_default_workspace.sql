DO $m$ DECLARE d text; BEGIN
 d := pg_get_functiondef('public.start_broker_signup_grace'::regproc);
 d := replace(d, 'IS NULL OR workspace_name = (SELECT full_name', 'IS NULL OR workspace_name = ''My Workspace'' OR workspace_name = (SELECT full_name');
 IF position('''My Workspace''' IN d)=0 THEN RAISE EXCEPTION 'patch_failed'; END IF;
 EXECUTE d;
END $m$;
UPDATE public.workspace_memberships m SET workspace_name = left(btrim(p.signup_details->>'office_name'),200), updated_at = now()
FROM public.profiles p
WHERE m.user_id = p.id AND m.workspace_owner_id = p.id AND p.primary_user_type = 'broker'
  AND NULLIF(btrim(COALESCE(p.signup_details->>'office_name','')),'') IS NOT NULL
  AND m.workspace_name = 'My Workspace';