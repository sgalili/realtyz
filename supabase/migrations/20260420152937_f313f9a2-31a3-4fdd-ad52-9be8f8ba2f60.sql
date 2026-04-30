-- ============================================================
-- KALPIZ FEATURE PARITY — Phase 1 Migration
-- Pricing, Budget, Usage, RAG Knowledge Base, Onboarding, Toggles
-- ============================================================

-- Enable pgvector for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. PRICING PLANS (seeded with 3 Kalpiz tiers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name_he text NOT NULL,
  description_he text,
  monthly_price numeric NOT NULL,
  setup_fee numeric NOT NULL DEFAULT 5000,
  mandates_target int NOT NULL,
  included_ai_touchpoints int NOT NULL,
  included_sms int NOT NULL,
  included_whatsapp int NOT NULL,
  included_voice_minutes int NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads pricing_plans"
  ON public.pricing_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage pricing_plans"
  ON public.pricing_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.pricing_plans
  (slug, name_he, description_he, monthly_price, setup_fee, mandates_target,
   included_ai_touchpoints, included_sms, included_whatsapp, included_voice_minutes, features, sort_order)
VALUES
  ('breakthrough', 'מסלול פריצה', 'למועמדים בודדים ולקמפיינים מקומיים. יעד: מנדט בודד',
   2999, 5000, 1, 300000, 8000, 8000, 1000,
   '["דיוור אלקטרוני ללא הגבלה","תקשורת בכל הרשתות החברתיות","2 מושבי מפקח","תמיכה טכנית סטנדרטית"]'::jsonb, 1),
  ('power', 'מסלול עוצמה', 'למפלגות בינוניות ומועמדים בכירים. יעד: +3 מנדטים',
   7999, 5000, 3, 1500000, 30000, 30000, 3750,
   '["מפת מחוזות אינטראקטיבית","אימון AI בעדיפות גבוהה","5 מושבי מפקח","ליווי אסטרטגי שבועי"]'::jsonb, 2),
  ('victory', 'מסלול ניצחון', 'למפלגות גדולות וקמפיינים ארציים. יעד: +10 מנדטים',
   14999, 5000, 10, 5000000, 100000, 100000, 12500,
   '["מפת מחוזות + ניתוח מתקדם","מודלים ייעודיים","מנהל הצלחת לקוח 24/7","מושבי מפקח ללא הגבלה","חמ\"ל אסטרטגי יומי"]'::jsonb, 3)
ON CONFLICT (slug) DO UPDATE SET
  monthly_price = EXCLUDED.monthly_price,
  included_ai_touchpoints = EXCLUDED.included_ai_touchpoints,
  included_sms = EXCLUDED.included_sms,
  included_whatsapp = EXCLUDED.included_whatsapp,
  included_voice_minutes = EXCLUDED.included_voice_minutes,
  features = EXCLUDED.features;

-- ============================================================
-- 2. USER SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid REFERENCES public.pricing_plans(id),
  election_type text NOT NULL DEFAULT 'general', -- general | primaries
  mandate_target int DEFAULT 1,
  months_to_election int DEFAULT 6,
  hot_list_count int DEFAULT 0,
  cold_list_count int DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription"
  ON public.user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users upsert own subscription"
  ON public.user_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users update own subscription"
  ON public.user_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 3. BUDGET LIMITS (per-user, per-service caps)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_type text NOT NULL, -- sms | whatsapp | ai_voice | meta_ads | ai_touchpoints | email
  monthly_limit numeric NOT NULL DEFAULT 0,
  hard_stop boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, service_type)
);

ALTER TABLE public.budget_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budget_limits"
  ON public.budget_limits FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 4. USAGE EVENTS (auto-tracked on every send)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_type text NOT NULL,
  units numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
  ON public.usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_service
  ON public.usage_events (user_id, service_type, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage_events"
  ON public.usage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated insert usage_events"
  ON public.usage_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 5. BALANCE ADJUSTMENTS (super-admin manual credits/debits)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.balance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL, -- positive = top-up, negative = debit
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_adjustments_user
  ON public.balance_adjustments (user_id, created_at DESC);

ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own balance_adjustments"
  ON public.balance_adjustments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins manage balance_adjustments"
  ON public.balance_adjustments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 6. KNOWLEDGE BASE (documents + chunks with embeddings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL DEFAULT 'text', -- pdf | text | whatsapp
  title text NOT NULL,
  raw_text text,
  file_path text,
  source_metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  chunk_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own knowledge_documents"
  ON public.knowledge_documents FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user ON public.knowledge_chunks (user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON public.knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON public.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own knowledge_chunks"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users insert own knowledge_chunks"
  ON public.knowledge_chunks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users delete own knowledge_chunks"
  ON public.knowledge_chunks FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- RPC: semantic search over user's own chunks
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(768),
  match_user_id uuid,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  document_title text,
  content text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kd.title AS document_title,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kc.user_id = match_user_id
    AND kd.is_active = true
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Storage bucket for uploaded KB files
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own knowledge files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 7. ONBOARDING STATE (3-step wizard)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  step int NOT NULL DEFAULT 1,
  election_type text,
  candidate_or_party text,
  tone text,
  mandate_target int,
  months_to_election int,
  hot_list_count int,
  cold_list_count int,
  initial_message text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own onboarding_state"
  ON public.onboarding_state FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 8. SERVICE TOGGLES (per-user feature flags)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_key text NOT NULL, -- touchpoint_ai_voice | omnichannel_inbox | meta_ads_sync | whatsapp_gateway | sms_gateway | ai_content_gen | knowledge_base
  enabled boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, service_key)
);

ALTER TABLE public.service_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own service_toggles"
  ON public.service_toggles FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 9. KB WHITELIST (WhatsApp senders allowed to ingest via /kb)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kb_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number text NOT NULL, -- normalized 9725XXXXXXXX
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

ALTER TABLE public.kb_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kb_whitelist"
  ON public.kb_whitelist FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 10. BALANCE VIEW (top-ups - spend)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_balance(_user_id uuid)
RETURNS TABLE (
  total_topups numeric,
  total_spend numeric,
  mtd_spend numeric,
  balance numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(amount) FROM public.balance_adjustments WHERE user_id = _user_id AND amount > 0), 0) AS total_topups,
    COALESCE((SELECT SUM(total_cost) FROM public.usage_events WHERE user_id = _user_id), 0) AS total_spend,
    COALESCE((SELECT SUM(total_cost) FROM public.usage_events
              WHERE user_id = _user_id
                AND created_at >= date_trunc('month', now())), 0) AS mtd_spend,
    COALESCE((SELECT SUM(amount) FROM public.balance_adjustments WHERE user_id = _user_id), 0)
      - COALESCE((SELECT SUM(total_cost) FROM public.usage_events WHERE user_id = _user_id), 0) AS balance;
$$;

-- Update triggers
CREATE TRIGGER trg_user_subscriptions_updated
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();

CREATE TRIGGER trg_budget_limits_updated
  BEFORE UPDATE ON public.budget_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();

CREATE TRIGGER trg_knowledge_documents_updated
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();

CREATE TRIGGER trg_onboarding_state_updated
  BEFORE UPDATE ON public.onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();

CREATE TRIGGER trg_service_toggles_updated
  BEFORE UPDATE ON public.service_toggles
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();