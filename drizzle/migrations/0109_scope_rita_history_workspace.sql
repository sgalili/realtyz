ALTER TABLE public.ai_drawer_history ADD COLUMN IF NOT EXISTS workspace_owner_id uuid DEFAULT public.current_workspace_owner();
COMMENT ON COLUMN public.ai_drawer_history.workspace_owner_id IS 'Authorized workspace for new Rita turns; legacy rows have unknown provenance and must not be restored.';
-- Existing transcripts were account-only and may contain mixed workspace identities.
UPDATE public.ai_drawer_history SET workspace_owner_id = NULL;
GRANT SELECT, INSERT, DELETE ON public.ai_drawer_history TO authenticated;
GRANT ALL ON public.ai_drawer_history TO service_role;
ALTER TABLE public.ai_drawer_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY rita_workspace_boundary ON public.ai_drawer_history AS RESTRICTIVE FOR ALL TO authenticated USING (workspace_owner_id IS NOT NULL AND public.ws_current_access(workspace_owner_id)) WITH CHECK (workspace_owner_id IS NOT NULL AND public.ws_current_access(workspace_owner_id) AND user_id = auth.uid());
CREATE INDEX IF NOT EXISTS ai_drawer_history_workspace_user_created ON public.ai_drawer_history(workspace_owner_id, user_id, created_at);