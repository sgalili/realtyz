CREATE TABLE public.wa_avatar_sync_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_owner_id uuid NOT NULL,
  started_by uuid,
  status text NOT NULL DEFAULT 'queued',
  force_refresh boolean NOT NULL DEFAULT false,
  total integer NOT NULL DEFAULT 0,
  scanned integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wa_avatar_sync_jobs_status_check CHECK (status = ANY (ARRAY['queued','running','done','failed']))
);

GRANT SELECT, INSERT ON public.wa_avatar_sync_jobs TO authenticated;
GRANT ALL ON public.wa_avatar_sync_jobs TO service_role;

ALTER TABLE public.wa_avatar_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view avatar sync jobs"
ON public.wa_avatar_sync_jobs FOR SELECT TO authenticated
USING (
  workspace_owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.user_id = auth.uid() AND m.workspace_owner_id = wa_avatar_sync_jobs.workspace_owner_id
  )
);

CREATE POLICY "Workspace members can start avatar sync jobs"
ON public.wa_avatar_sync_jobs FOR INSERT TO authenticated
WITH CHECK (
  started_by = auth.uid()
  AND (
    workspace_owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.user_id = auth.uid() AND m.workspace_owner_id = wa_avatar_sync_jobs.workspace_owner_id
    )
  )
);

CREATE INDEX idx_wa_avatar_sync_jobs_owner_created
ON public.wa_avatar_sync_jobs (workspace_owner_id, created_at DESC);

CREATE TRIGGER trg_wa_avatar_sync_jobs_updated_at
BEFORE UPDATE ON public.wa_avatar_sync_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();