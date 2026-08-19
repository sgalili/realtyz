CREATE TABLE public.property_tours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  listing_id uuid,
  share_token text,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  client_email text,
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  property_title text,
  property_address text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  whatsapp_sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_tours_status_check CHECK (status = ANY (ARRAY['pending','confirmed','completed','cancelled']))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_tours TO authenticated;
GRANT ALL ON public.property_tours TO service_role;

ALTER TABLE public.property_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members manage property tours"
  ON public.property_tours FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_member(owner_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR public.is_workspace_member(owner_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_property_tours_owner_time ON public.property_tours (owner_id, scheduled_at);

CREATE TRIGGER update_property_tours_updated_at
  BEFORE UPDATE ON public.property_tours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();