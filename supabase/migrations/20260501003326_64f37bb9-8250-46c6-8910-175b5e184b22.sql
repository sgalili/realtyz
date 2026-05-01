
-- Outreach Engine: suggestions queue + auto-draft policy

CREATE TABLE IF NOT EXISTS public.outreach_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  trigger_type text NOT NULL, -- e.g. 'post_viewing_24h', 'price_drop', 'stale_negotiation', 'cold_reengage'
  trigger_reason text NOT NULL, -- human-readable, e.g. "24h after viewing on 12 Rothschild"
  draft_message text NOT NULL,
  tier text, -- snapshot of lead.loyalty_tier at suggestion time
  status text NOT NULL DEFAULT 'pending', -- pending | used | dismissed | expired
  ai_generated boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  dismissed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outreach_suggestions_user_status
  ON public.outreach_suggestions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_suggestions_lead
  ON public.outreach_suggestions(lead_id);
-- Prevent duplicate active suggestions per (lead, trigger_type)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_outreach_pending_per_trigger
  ON public.outreach_suggestions(lead_id, trigger_type)
  WHERE status = 'pending';

ALTER TABLE public.outreach_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own outreach_suggestions"
  ON public.outreach_suggestions
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_outreach_suggestions_updated
  BEFORE UPDATE ON public.outreach_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Auto-draft policy per tier
CREATE TABLE IF NOT EXISTS public.outreach_auto_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier text NOT NULL, -- matches leads.loyalty_tier (e.g. 'Hot Lead', 'מתלבט')
  auto_draft boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tier)
);

ALTER TABLE public.outreach_auto_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own outreach_auto_policies"
  ON public.outreach_auto_policies
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_outreach_policies_updated
  BEFORE UPDATE ON public.outreach_auto_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
