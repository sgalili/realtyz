CREATE TABLE IF NOT EXISTS public.demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  current_route text NOT NULL DEFAULT '/',
  archetype text,
  referrer text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demo_captured_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  email text,
  phone_number text,
  archetype text,
  value_trap_type text NOT NULL DEFAULT 'send_report',
  engagement_score integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_captured_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Demo visitors can create demo sessions"
ON public.demo_sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Demo visitors can refresh demo sessions"
ON public.demo_sessions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Super admins can view demo sessions"
ON public.demo_sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage demo sessions"
ON public.demo_sessions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Demo visitors can submit captured leads"
ON public.demo_captured_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Super admins can view captured demo leads"
ON public.demo_captured_leads
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage captured demo leads"
ON public.demo_captured_leads
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_demo_sessions_last_seen_at ON public.demo_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_archetype ON public.demo_sessions (archetype);
CREATE INDEX IF NOT EXISTS idx_demo_captured_leads_created_at ON public.demo_captured_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_captured_leads_archetype ON public.demo_captured_leads (archetype);