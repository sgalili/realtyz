
CREATE TABLE IF NOT EXISTS public.campaign_activity_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  created_by uuid,
  activity_type text NOT NULL CHECK (activity_type IN (
    'fb_group_post','fb_comment','messenger','manual_share','ayrshare_post','outreach'
  )),
  target_ref text,
  target_label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  variations jsonb NOT NULL DEFAULT '[]'::jsonb,
  variation_index integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','processing','ready','completed','failed','skipped','cancelled'
  )),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_activity_queue TO authenticated;
GRANT ALL ON public.campaign_activity_queue TO service_role;

ALTER TABLE public.campaign_activity_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_workspace_select" ON public.campaign_activity_queue
  FOR SELECT TO authenticated
  USING (
    workspace_owner_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_owner_id = campaign_activity_queue.workspace_owner_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "queue_workspace_insert" ON public.campaign_activity_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      workspace_owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_memberships m
        WHERE m.workspace_owner_id = campaign_activity_queue.workspace_owner_id
          AND m.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "queue_workspace_update" ON public.campaign_activity_queue
  FOR UPDATE TO authenticated
  USING (
    workspace_owner_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_owner_id = campaign_activity_queue.workspace_owner_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "queue_workspace_delete" ON public.campaign_activity_queue
  FOR DELETE TO authenticated
  USING (
    workspace_owner_id = auth.uid()
    OR created_by = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_caq_status_sched
  ON public.campaign_activity_queue (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_caq_workspace_status
  ON public.campaign_activity_queue (workspace_owner_id, status, scheduled_for);

CREATE OR REPLACE FUNCTION public.touch_caq_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_caq_touch ON public.campaign_activity_queue;
CREATE TRIGGER trg_caq_touch
  BEFORE UPDATE ON public.campaign_activity_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_caq_updated_at();
