-- Trial autopilot outbound message log
CREATE TABLE IF NOT EXISTS public.trial_autopilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voter_id uuid,
  recipient_phone text NOT NULL,
  recipient_name text,
  message_body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  failure_reason text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_autopilot_messages_user_idx
  ON public.trial_autopilot_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trial_autopilot_messages_status_idx
  ON public.trial_autopilot_messages (status, scheduled_for);

ALTER TABLE public.trial_autopilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own trial autopilot messages"
  ON public.trial_autopilot_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Inserts and updates only via service role (edge functions). No client write policies.

-- Trial inbound replies (do NOT count against quota)
CREATE TABLE IF NOT EXISTS public.trial_inbound_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voter_id uuid,
  sender_phone text NOT NULL,
  message_body text NOT NULL,
  ai_response text,
  ai_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_inbound_replies_user_idx
  ON public.trial_inbound_replies (user_id, created_at DESC);

ALTER TABLE public.trial_inbound_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own trial inbound replies"
  ON public.trial_inbound_replies
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Helper: count outbound messages already used by a trial user
CREATE OR REPLACE FUNCTION public.trial_outbound_used(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::int, 0)
  FROM public.trial_autopilot_messages
  WHERE user_id = _user_id
    AND status IN ('sent', 'queued', 'sending');
$$;