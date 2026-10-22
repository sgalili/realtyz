CREATE OR REPLACE FUNCTION public.admin_purge_user_data(_uid uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE r record; total integer := 0; n integer; pass integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'uid_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin') THEN RAISE EXCEPTION 'cannot_delete_super_admin'; END IF;
  FOR pass IN 1..4 LOOP
    FOR r IN
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
      WHERE c.table_schema='public' AND c.data_type='uuid'
        AND c.column_name IN ('workspace_owner_id','user_id','owner_id','created_by','broker_id','affiliate_id','referrer_id','referred_id','assigned_to')
        AND c.table_name NOT IN ('profiles','user_roles','audit_logs')
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING _uid;
        GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      EXCEPTION WHEN others THEN NULL;
      END;
    END LOOP;
  END LOOP;
  BEGIN DELETE FROM public.user_roles WHERE user_id=_uid; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE id=_uid; EXCEPTION WHEN others THEN NULL; END;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.admin_purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_user_data(uuid) TO service_role;