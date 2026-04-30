CREATE TABLE public.approval_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'outbound_message',
  platform TEXT NOT NULL DEFAULT 'whatsapp',
  target_voter_id UUID NULL,
  target_label TEXT NULL,
  title TEXT NOT NULL,
  proposed_content TEXT NOT NULL,
  edited_content TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  requires_human_review BOOLEAN NOT NULL DEFAULT true,
  low_confidence_reason TEXT NULL,
  source_citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  live_post_url TEXT NULL,
  created_by_ai BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID NULL,
  approved_at TIMESTAMP WITH TIME ZONE NULL,
  rejected_by UUID NULL,
  rejected_at TIMESTAMP WITH TIME ZONE NULL,
  rejection_reason TEXT NULL,
  posted_by UUID NULL,
  posted_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.interaction_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  thread_key TEXT NOT NULL,
  parent_id UUID NULL,
  platform TEXT NOT NULL DEFAULT 'whatsapp',
  action_type TEXT NOT NULL DEFAULT 'message',
  actor_type TEXT NOT NULL DEFAULT 'ai_agent',
  actor_id UUID NULL,
  actor_label TEXT NULL,
  content TEXT NOT NULL,
  sentiment TEXT NULL,
  confidence_score INTEGER NULL,
  source_citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_queue_id UUID NULL REFERENCES public.approval_queue(id) ON DELETE SET NULL,
  live_post_url TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own approval_queue"
ON public.approval_queue
FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users manage own interaction_activity_log"
ON public.interaction_activity_log
FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_approval_queue_user_status ON public.approval_queue(user_id, status, created_at DESC);
CREATE INDEX idx_approval_queue_target_voter ON public.approval_queue(target_voter_id) WHERE target_voter_id IS NOT NULL;
CREATE INDEX idx_activity_log_user_created ON public.interaction_activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_log_thread ON public.interaction_activity_log(thread_key, created_at ASC);
CREATE INDEX idx_activity_log_approval ON public.interaction_activity_log(approval_queue_id) WHERE approval_queue_id IS NOT NULL;

CREATE TRIGGER update_approval_queue_updated_at
BEFORE UPDATE ON public.approval_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();