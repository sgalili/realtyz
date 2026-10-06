DO $$
DECLARE r record; col text;
BEGIN
  FOR r IN
    SELECT c.relname,
      bool_or(a.attname='workspace_owner_id') has_ws,
      bool_or(a.attname='user_id') has_user
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind='r' AND c.relrowsecurity
    GROUP BY c.relname
  LOOP
    IF r.relname IN ('user_roles','profiles','api_configs','platform_oauth_apps','credit_wallets','credit_transactions','user_subscriptions') THEN CONTINUE; END IF;
    col := CASE WHEN r.has_ws THEN 'workspace_owner_id' WHEN r.has_user THEN 'user_id' ELSE NULL END;
    IF col IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS superadmin_tenant_full_access ON public.%I', r.relname);
    EXECUTE format($p$CREATE POLICY superadmin_tenant_full_access ON public.%I AS PERMISSIVE FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'super_admin'::app_role) AND %I = public.current_workspace_owner())
      WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) AND %I = public.current_workspace_owner())$p$, r.relname, col, col);
  END LOOP;
END $$;