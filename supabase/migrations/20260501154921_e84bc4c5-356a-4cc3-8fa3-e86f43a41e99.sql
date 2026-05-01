-- Listing visibility
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_listings_user_featured
  ON public.listings(user_id) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_listings_user_promoted
  ON public.listings(user_id) WHERE is_promoted = true;

-- Platform settings (per-broker feature flags)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enable_auto_followups boolean NOT NULL DEFAULT true,
  enable_community_broadcasts boolean NOT NULL DEFAULT true,
  enable_client_portal boolean NOT NULL DEFAULT true,
  enable_broker_referrals boolean NOT NULL DEFAULT true,
  enable_ai_autopilot boolean NOT NULL DEFAULT true,
  enable_voice_calls boolean NOT NULL DEFAULT false,
  enable_featured_listings boolean NOT NULL DEFAULT true,
  enable_pending_extraction boolean NOT NULL DEFAULT true,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own platform_settings" ON public.platform_settings;
CREATE POLICY "Owner reads own platform_settings"
ON public.platform_settings FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admin manages own platform_settings" ON public.platform_settings;
CREATE POLICY "Admin manages own platform_settings"
ON public.platform_settings FOR ALL TO authenticated
USING (
  (user_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'managing_broker'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  OR has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  (user_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'managing_broker'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE TRIGGER trg_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();