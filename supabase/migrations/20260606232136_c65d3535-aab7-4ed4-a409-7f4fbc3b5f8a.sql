CREATE TABLE public.agent_learning_lexicon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NULL REFERENCES public.listings(id) ON DELETE SET NULL,
  context text NULL,
  original_ai_text text NOT NULL,
  user_edited_text text NOT NULL,
  extracted_rule_insight text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_learning_lexicon TO authenticated;
GRANT ALL ON public.agent_learning_lexicon TO service_role;

ALTER TABLE public.agent_learning_lexicon ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own learning rows"
  ON public.agent_learning_lexicon FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own learning rows"
  ON public.agent_learning_lexicon FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own learning rows"
  ON public.agent_learning_lexicon FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own learning rows"
  ON public.agent_learning_lexicon FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX agent_learning_lexicon_user_recent_idx
  ON public.agent_learning_lexicon (user_id, created_at DESC);