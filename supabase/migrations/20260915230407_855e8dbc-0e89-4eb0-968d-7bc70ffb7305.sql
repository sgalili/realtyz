ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS lease_end_date date;

ALTER TABLE public.property_tours
  ADD COLUMN IF NOT EXISTS feedback_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_birth_date ON public.leads (birth_date) WHERE birth_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lease_end_date ON public.leads (lease_end_date) WHERE lease_end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_tours_feedback_due ON public.property_tours (scheduled_at) WHERE feedback_sent = false;

CREATE TABLE IF NOT EXISTS public.holiday_greetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_name text NOT NULL,
  greeting_date date NOT NULL,
  message_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_name, greeting_date)
);

GRANT SELECT ON public.holiday_greetings TO authenticated;
GRANT ALL ON public.holiday_greetings TO service_role;
ALTER TABLE public.holiday_greetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read holiday greetings"
  ON public.holiday_greetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage holiday greetings"
  ON public.holiday_greetings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_holiday_greetings_updated_at
  BEFORE UPDATE ON public.holiday_greetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.engagement_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  dedupe_key text NOT NULL,
  phone_number text,
  message text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_name, dedupe_key)
);

GRANT SELECT ON public.engagement_message_log TO authenticated;
GRANT ALL ON public.engagement_message_log TO service_role;
ALTER TABLE public.engagement_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace can read its engagement log"
  ON public.engagement_message_log FOR SELECT TO authenticated
  USING (public.ws_current_access(workspace_owner_id));