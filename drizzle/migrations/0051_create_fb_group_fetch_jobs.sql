-- Cloud-first Facebook group discovery jobs: a workspace member asks the
-- Railway cloud runner to scrape candidate groups with the saved cloud
-- session, and the result is polled back into the app. Extension no longer
-- required for group fetching.
CREATE TABLE public.fb_group_fetch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  requested_by uuid,
  query text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  groups jsonb,
  error text,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_group_fetch_jobs TO authenticated;
GRANT ALL ON public.fb_group_fetch_jobs TO service_role;

ALTER TABLE public.fb_group_fetch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fb group fetch active workspace select" ON public.fb_group_fetch_jobs
  FOR SELECT TO authenticated USING (ws_current_access(workspace_owner_id));
CREATE POLICY "fb group fetch active workspace insert" ON public.fb_group_fetch_jobs
  FOR INSERT TO authenticated WITH CHECK (ws_current_access(workspace_owner_id));
CREATE POLICY "fb group fetch active workspace delete" ON public.fb_group_fetch_jobs
  FOR DELETE TO authenticated USING (ws_current_access(workspace_owner_id));
CREATE POLICY superadmin_tenant_full_access ON public.fb_group_fetch_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) AND workspace_owner_id = current_workspace_owner())
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) AND workspace_owner_id = current_workspace_owner());

CREATE INDEX idx_fb_group_fetch_jobs_ws ON public.fb_group_fetch_jobs (workspace_owner_id, status, created_at DESC);

CREATE TRIGGER trg_fb_group_fetch_jobs_touch
  BEFORE UPDATE ON public.fb_group_fetch_jobs
  FOR EACH ROW EXECUTE FUNCTION _touch_updated_at();