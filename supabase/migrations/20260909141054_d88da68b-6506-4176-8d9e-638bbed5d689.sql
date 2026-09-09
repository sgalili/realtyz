CREATE TABLE public.demo_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  preferred_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'new',
  notes text,
  source text NOT NULL DEFAULT 'landing',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.demo_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_requests TO authenticated;
GRANT ALL ON public.demo_requests TO service_role;

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can request a demo"
ON public.demo_requests FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can read demo requests"
ON public.demo_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can update demo requests"
ON public.demo_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can delete demo requests"
ON public.demo_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_demo_requests_created_at ON public.demo_requests (created_at DESC);