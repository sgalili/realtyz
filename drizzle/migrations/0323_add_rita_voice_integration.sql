CREATE TABLE public.rita_voice_runtime (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  agent_id text NOT NULL,
  agent_phone_number_id text NOT NULL,
  phone_number text NOT NULL,
  tool_id text,
  tool_secret_id text,
  webhook_id text,
  webhook_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rita_voice_runtime TO service_role;
REVOKE ALL ON public.rita_voice_runtime FROM anon, authenticated;
ALTER TABLE public.rita_voice_runtime ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.rita_voice_runtime IS 'Server-only ElevenLabs and Twilio runtime configuration. Never expose webhook_secret to clients.';

CREATE TABLE public.rita_call_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  source text NOT NULL,
  full_name text,
  lead_phone text,
  agency_name text NOT NULL DEFAULT 'TORAFF',
  agent_name text NOT NULL DEFAULT 'TORAFF',
  property_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  dynamic_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_id text UNIQUE,
  provider_call_id text,
  status text NOT NULL DEFAULT 'pending',
  qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_property_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  transcript_summary text,
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rita_call_contexts TO authenticated;
GRANT ALL ON public.rita_call_contexts TO service_role;
ALTER TABLE public.rita_call_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rita_call_contexts_workspace_select" ON public.rita_call_contexts
  FOR SELECT TO authenticated
  USING ((select public.ws_current_access(workspace_owner_id)));
CREATE INDEX rita_call_contexts_workspace_created_idx ON public.rita_call_contexts (workspace_owner_id, created_at DESC);
CREATE INDEX rita_call_contexts_phone_created_idx ON public.rita_call_contexts (lead_phone, created_at DESC);
CREATE INDEX rita_call_contexts_lead_idx ON public.rita_call_contexts (lead_id);
CREATE INDEX rita_call_contexts_property_idx ON public.rita_call_contexts (property_id);
COMMENT ON TABLE public.rita_call_contexts IS 'Workspace-scoped Rita call context and post-call qualification. Server writes only after authenticated or signed requests.';

CREATE UNIQUE INDEX call_records_elevenlabs_conversation_unique_idx
  ON public.call_records (elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;
