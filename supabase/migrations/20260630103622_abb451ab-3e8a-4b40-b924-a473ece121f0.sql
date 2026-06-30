
-- Workspace social profile: all authenticated users can READ the singleton
-- workspace profile (it represents shared workspace connection state). Writes
-- remain admin-only via the existing "Admins can manage workspace social profile" policy.
DROP POLICY IF EXISTS "workspace_social_profile_admin_select" ON public.workspace_social_profile;
CREATE POLICY "workspace_social_profile_authenticated_read"
  ON public.workspace_social_profile FOR SELECT
  TO authenticated USING (true);

-- Ayrshare social accounts: shared workspace resource → all authenticated users
-- can READ. Mutations stay constrained by the existing "manage own" policy
-- plus service_role (used by edge functions).
DROP POLICY IF EXISTS "users view own ayrshare accounts" ON public.ayrshare_social_accounts;
CREATE POLICY "ayrshare_social_accounts_authenticated_read"
  ON public.ayrshare_social_accounts FOR SELECT
  TO authenticated USING (true);

-- social_connections: any authenticated user can SEE which platforms are
-- connected for the workspace. Writes still gated by existing policies
-- (admins or own row).
DROP POLICY IF EXISTS "Users can view own social connections" ON public.social_connections;
DROP POLICY IF EXISTS "Admins can view social connections" ON public.social_connections;
CREATE POLICY "social_connections_authenticated_read"
  ON public.social_connections FOR SELECT
  TO authenticated USING (true);

-- Backfill the connected Facebook page id for the workspace singleton.
UPDATE public.workspace_social_profile
SET facebook_page_id = '729806313557785',
    facebook_page_name = COALESCE(NULLIF(facebook_page_name, ''),
                                  'אודי ויטמן יועץ נדל"ן מתווך באנגלו סכסון הרצליה'),
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND (facebook_page_id IS NULL OR facebook_page_id = '');
