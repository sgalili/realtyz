CREATE TABLE public.rita_live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  visitor_token_hash text UNIQUE,
  mode text NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','human')),
  handled_by uuid,
  last_message text,
  last_role text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR visitor_token_hash IS NOT NULL)
);
CREATE INDEX rita_live_sessions_last_idx ON public.rita_live_sessions (last_message_at DESC);
CREATE INDEX rita_live_sessions_user_idx ON public.rita_live_sessions (user_id);
GRANT SELECT, UPDATE ON public.rita_live_sessions TO authenticated;
GRANT ALL ON public.rita_live_sessions TO service_role;
ALTER TABLE public.rita_live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or super admin read sessions" ON public.rita_live_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "super admin updates sessions" ON public.rita_live_sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE public.rita_live_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.rita_live_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','admin')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rita_live_messages_session_idx ON public.rita_live_messages (session_id, created_at);
GRANT SELECT ON public.rita_live_messages TO authenticated;
GRANT ALL ON public.rita_live_messages TO service_role;
ALTER TABLE public.rita_live_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or super admin read messages" ON public.rita_live_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rita_live_sessions s WHERE s.id = session_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))));