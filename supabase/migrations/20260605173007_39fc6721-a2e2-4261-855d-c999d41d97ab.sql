
-- 1) engagement_events: backing store for the social feed, comments, autopilot.
CREATE TABLE IF NOT EXISTS public.engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL,
  sender_handle text,
  inbound_text text,
  ai_reply_text text,
  status text NOT NULL DEFAULT 'pending',
  ai_action text NOT NULL DEFAULT 'none',
  sentiment text,
  external_id text,
  external_post_id text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engagement_events_user_created_idx
  ON public.engagement_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS engagement_events_user_archived_idx
  ON public.engagement_events (user_id, is_archived);
CREATE INDEX IF NOT EXISTS engagement_events_external_post_idx
  ON public.engagement_events (external_post_id);
CREATE INDEX IF NOT EXISTS engagement_events_platform_idx
  ON public.engagement_events (platform);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_events TO authenticated;
GRANT ALL ON public.engagement_events TO service_role;

ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_events: owner read"
  ON public.engagement_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

CREATE POLICY "engagement_events: owner write"
  ON public.engagement_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "engagement_events: owner update"
  ON public.engagement_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "engagement_events: owner delete"
  ON public.engagement_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_above(auth.uid()));

CREATE TRIGGER engagement_events_set_updated_at
  BEFORE UPDATE ON public.engagement_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) auto-reply sentiment flags on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_reply_positive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_negative boolean NOT NULL DEFAULT false;
