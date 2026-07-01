
CREATE TABLE IF NOT EXISTS public.ayrshare_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,           -- 'post' | 'comment_reply' | 'like' | 'delete'
  platform text,
  target_id text,                       -- post id / comment id being acted on
  content_hash text,                    -- sha256 of outbound text (for dedupe)
  content_preview text,
  status text NOT NULL DEFAULT 'ok',    -- 'ok' | 'blocked' | 'error'
  block_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ayr_action_log_recent
  ON public.ayrshare_action_log (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayr_action_log_hash
  ON public.ayrshare_action_log (content_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayr_action_log_target
  ON public.ayrshare_action_log (target_id, action_type, created_at DESC);

GRANT ALL ON public.ayrshare_action_log TO service_role;
ALTER TABLE public.ayrshare_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages ayr action log"
  ON public.ayrshare_action_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
