-- LISTINGS: workspace isolation for signed-in users, public access only for anonymous visitors
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
CREATE POLICY "Anon can view published listings"
ON public.listings FOR SELECT TO anon
USING (is_published = true AND status = 'live');

CREATE POLICY "listings_select_workspace"
ON public.listings FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.shares_workspace_with(user_id, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Users and managers can delete listings" ON public.listings;
CREATE POLICY "listings_delete_workspace"
ON public.listings FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.shares_workspace_with(user_id, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Users can update own listings" ON public.listings;
CREATE POLICY "listings_update_workspace"
ON public.listings FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.shares_workspace_with(user_id, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- SOCIAL CONNECTIONS: no more cross-tenant visibility
DROP POLICY IF EXISTS "social_connections_authenticated_read" ON public.social_connections;
CREATE POLICY "social_connections_select_workspace"
ON public.social_connections FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.shares_workspace_with(created_by, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- CAMPAIGN SETTINGS: only shared defaults (no owner) plus own/workspace rows
DROP POLICY IF EXISTS "Authenticated users can read campaign_settings" ON public.campaign_settings;
CREATE POLICY "campaign_settings_select_workspace"
ON public.campaign_settings FOR SELECT TO authenticated
USING (
  updated_by IS NULL
  OR updated_by = auth.uid()
  OR public.shares_workspace_with(updated_by, auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);