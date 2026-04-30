CREATE TABLE IF NOT EXISTS public.candidate_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  candidate_name TEXT NOT NULL,
  headline TEXT NOT NULL,
  thesis TEXT NOT NULL,
  pillars JSONB NOT NULL DEFAULT '[]'::jsonb,
  mandate_goal INTEGER NOT NULL DEFAULT 1,
  supporter_count INTEGER NOT NULL DEFAULT 0,
  election_type TEXT NOT NULL DEFAULT 'general',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.candidate_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published candidate pages"
ON public.candidate_pages
FOR SELECT
TO anon, authenticated
USING (is_published = true);

CREATE POLICY "Users can create own candidate pages"
ON public.candidate_pages
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update own candidate pages"
ON public.candidate_pages
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete own candidate pages"
ON public.candidate_pages
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_candidate_pages_slug ON public.candidate_pages (slug);
CREATE INDEX IF NOT EXISTS idx_candidate_pages_user_id ON public.candidate_pages (user_id);

CREATE OR REPLACE FUNCTION public.update_candidate_pages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_candidate_pages_updated_at ON public.candidate_pages;
CREATE TRIGGER update_candidate_pages_updated_at
BEFORE UPDATE ON public.candidate_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_candidate_pages_updated_at();