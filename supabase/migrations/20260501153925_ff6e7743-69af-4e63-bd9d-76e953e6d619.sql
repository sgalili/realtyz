
CREATE TABLE public.client_portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_portal_links_lead_idx ON public.client_portal_links(lead_id);
CREATE INDEX client_portal_links_user_idx ON public.client_portal_links(user_id);

ALTER TABLE public.client_portal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own client_portal_links"
  ON public.client_portal_links FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_client_portal_links_updated
  BEFORE UPDATE ON public.client_portal_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.client_portal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.client_portal_links(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  referrer text
);
CREATE INDEX client_portal_views_link_idx ON public.client_portal_views(link_id, viewed_at DESC);

ALTER TABLE public.client_portal_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own client_portal_views"
  ON public.client_portal_views FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_portal_links l
    WHERE l.id = client_portal_views.link_id
      AND ((l.user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  ));
