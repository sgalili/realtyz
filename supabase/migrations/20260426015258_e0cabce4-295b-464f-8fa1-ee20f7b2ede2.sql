-- Lead Generation: capture upgrade interest from the Strategic Growth Slider
CREATE TABLE IF NOT EXISTS public.admin_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  lead_type text NOT NULL DEFAULT 'upgrade_interest',
  current_target integer,
  attempted_target integer,
  election_type text,
  status text NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_leads_created_at ON public.admin_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_leads_user_id ON public.admin_leads (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_leads_status ON public.admin_leads (status);

ALTER TABLE public.admin_leads ENABLE ROW LEVEL SECURITY;

-- Authenticated users can record their own upgrade interest
CREATE POLICY "Users insert own upgrade leads"
ON public.admin_leads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can see their own leads (transparency)
CREATE POLICY "Users view own upgrade leads"
ON public.admin_leads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Super admins (and admins) can manage leads
CREATE POLICY "Admins update leads"
ON public.admin_leads
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete leads"
ON public.admin_leads
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_admin_leads_updated_at
BEFORE UPDATE ON public.admin_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime so super-admin sidebar can react instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_leads;