
-- system_intelligence_kb: continuous learning rules layer
CREATE TABLE IF NOT EXISTS public.system_intelligence_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  created_by uuid,
  actor_role text NOT NULL DEFAULT 'owner',
  source text NOT NULL DEFAULT 'kb_ui',
  rule_text text NOT NULL,
  raw_input text,
  signal text NOT NULL DEFAULT 'directive',
  weight numeric NOT NULL DEFAULT 1.0,
  embedding vector(1536),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_intelligence_kb_signal_check CHECK (signal IN ('positive','negative','directive')),
  CONSTRAINT system_intelligence_kb_role_check CHECK (actor_role IN ('owner','tenant','system')),
  CONSTRAINT system_intelligence_kb_source_check CHECK (source IN ('kb_ui','whatsapp_text','whatsapp_voice','approval','rejection','edit_diff'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_intelligence_kb TO authenticated;
GRANT ALL ON public.system_intelligence_kb TO service_role;

ALTER TABLE public.system_intelligence_kb ENABLE ROW LEVEL SECURITY;

-- Members of the workspace can read; only owners/admins can write
CREATE POLICY "members can view workspace rules"
ON public.system_intelligence_kb FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_memberships wm
    WHERE wm.user_id = auth.uid() AND wm.workspace_owner_id = system_intelligence_kb.workspace_owner_id
  )
  OR public.is_admin_or_above(auth.uid())
);

CREATE POLICY "owners can insert workspace rules"
ON public.system_intelligence_kb FOR INSERT
TO authenticated
WITH CHECK (
  workspace_owner_id = auth.uid()
  OR public.is_admin_or_above(auth.uid())
);

CREATE POLICY "owners can update workspace rules"
ON public.system_intelligence_kb FOR UPDATE
TO authenticated
USING (
  workspace_owner_id = auth.uid() OR public.is_admin_or_above(auth.uid())
)
WITH CHECK (
  workspace_owner_id = auth.uid() OR public.is_admin_or_above(auth.uid())
);

CREATE POLICY "owners can delete workspace rules"
ON public.system_intelligence_kb FOR DELETE
TO authenticated
USING (
  workspace_owner_id = auth.uid() OR public.is_admin_or_above(auth.uid())
);

CREATE INDEX IF NOT EXISTS system_intelligence_kb_workspace_active_idx
  ON public.system_intelligence_kb (workspace_owner_id, is_active);

CREATE INDEX IF NOT EXISTS system_intelligence_kb_embedding_idx
  ON public.system_intelligence_kb USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER system_intelligence_kb_set_updated_at
BEFORE UPDATE ON public.system_intelligence_kb
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Top-K semantic match restricted to active rules for the workspace.
-- Signal priority: directive=3, negative=2, positive=1.
CREATE OR REPLACE FUNCTION public.match_system_rules(
  _workspace uuid,
  _query_embedding vector,
  _k integer DEFAULT 8
)
RETURNS TABLE(
  id uuid,
  rule_text text,
  signal text,
  actor_role text,
  source text,
  weight numeric,
  similarity double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.rule_text, s.signal, s.actor_role, s.source, s.weight,
    1 - (s.embedding <=> _query_embedding) AS similarity
  FROM public.system_intelligence_kb s
  WHERE s.workspace_owner_id = _workspace
    AND s.is_active = true
    AND (s.expires_at IS NULL OR s.expires_at > now())
    AND s.embedding IS NOT NULL
  ORDER BY
    CASE s.signal WHEN 'directive' THEN 3 WHEN 'negative' THEN 2 ELSE 1 END DESC,
    s.weight DESC,
    s.embedding <=> _query_embedding
  LIMIT GREATEST(_k, 1);
$$;
