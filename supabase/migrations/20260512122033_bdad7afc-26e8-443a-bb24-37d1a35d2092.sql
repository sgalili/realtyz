
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ayrshare_profile_key text,
  ADD COLUMN IF NOT EXISTS ayrshare_ref_id text;

CREATE TABLE IF NOT EXISTS public.ayrshare_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  display_name text,
  username text,
  profile_url text,
  connected boolean NOT NULL DEFAULT true,
  raw jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE public.ayrshare_social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own ayrshare accounts"
  ON public.ayrshare_social_accounts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users manage own ayrshare accounts"
  ON public.ayrshare_social_accounts FOR ALL
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ayrshare_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ayrshare_ref_id text,
  event_type text,
  platform text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ayrshare_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own ayrshare events"
  ON public.ayrshare_webhook_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ayrshare_events_user ON public.ayrshare_webhook_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayrshare_events_ref ON public.ayrshare_webhook_events(ayrshare_ref_id);
