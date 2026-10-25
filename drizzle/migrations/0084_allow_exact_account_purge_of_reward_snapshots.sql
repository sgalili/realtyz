CREATE OR REPLACE FUNCTION public.prevent_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deletion_uid uuid;
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'postgres' THEN
    deletion_uid := nullif(current_setting('app.account_purge_uid', true), '')::uuid;
    IF deletion_uid IS NOT NULL AND (OLD.workspace_owner_id = deletion_uid OR OLD.affiliate_id = deletion_uid) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'reward snapshots are immutable';
END $$;
CREATE OR REPLACE FUNCTION public.admin_purge_user_data(_uid uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE r record; total integer := 0; n integer; pass integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'uid_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin') THEN RAISE EXCEPTION 'cannot_delete_super_admin'; END IF;
  PERFORM set_config('app.account_purge_uid', _uid::text, true);
  FOR pass IN 1..8 LOOP
    FOR r IN
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
      WHERE c.table_schema='public' AND c.data_type='uuid'
        AND c.column_name IN ('workspace_owner_id','user_id','owner_user_id','owner_id','created_by','broker_id','affiliate_id','referrer_id','referred_id','assigned_to')
        AND c.table_name NOT IN ('profiles','user_roles','audit_logs','deleted_accounts_archive','account_deletion_otps')
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING _uid;
        GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
      EXCEPTION WHEN foreign_key_violation THEN
        IF pass = 8 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
  DELETE FROM public.account_deletion_otps WHERE user_id=_uid;
  DELETE FROM public.user_roles WHERE user_id=_uid;
  DELETE FROM public.profiles WHERE id=_uid;
  PERFORM set_config('app.account_purge_uid', '', true);
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.admin_purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_user_data(uuid) TO service_role;