
-- Voice agent configuration (one per user)
CREATE TABLE public.voice_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  availability text NOT NULL DEFAULT 'away' CHECK (availability IN ('available','away')),
  elevenlabs_agent_id text,
  elevenlabs_voice_id text DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  elevenlabs_phone_number text,
  greeting text,
  language text NOT NULL DEFAULT 'he',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own voice_agents" ON public.voice_agents
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_voice_agents_updated_at
  BEFORE UPDATE ON public.voice_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Call transcripts / records
CREATE TABLE public.call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  elevenlabs_conversation_id text,
  caller_phone text,
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','missed','failed','in_progress','escalated')),
  handled_by text NOT NULL DEFAULT 'ai' CHECK (handled_by IN ('ai','agent')),
  duration_seconds integer DEFAULT 0,
  recording_url text,
  transcript jsonb DEFAULT '[]'::jsonb,
  transcript_text text,
  summary text,
  needs_callback boolean DEFAULT false,
  callback_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_records_user ON public.call_records(user_id, started_at DESC);
CREATE INDEX idx_call_records_lead ON public.call_records(lead_id, started_at DESC);
CREATE INDEX idx_call_records_conv ON public.call_records(elevenlabs_conversation_id);

ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call_records" ON public.call_records
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));
