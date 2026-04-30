
CREATE TABLE public.tracking_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_url TEXT NOT NULL,
  short_code TEXT NOT NULL UNIQUE,
  tag TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tracking links"
ON public.tracking_links FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create tracking links"
ON public.tracking_links FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update tracking links"
ON public.tracking_links FOR UPDATE TO authenticated USING (true);

-- Also add permissive RLS policies for existing tables so authenticated users can access data

-- voters
CREATE POLICY "Authenticated users can read voters"
ON public.voters FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert voters"
ON public.voters FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update voters"
ON public.voters FOR UPDATE TO authenticated USING (true);

-- messages
CREATE POLICY "Authenticated users can read messages"
ON public.messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert messages"
ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

-- campaigns
CREATE POLICY "Authenticated users can read campaigns"
ON public.campaigns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert campaigns"
ON public.campaigns FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaigns"
ON public.campaigns FOR UPDATE TO authenticated USING (true);

-- ai_content_logs
CREATE POLICY "Authenticated users can read ai_content_logs"
ON public.ai_content_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert ai_content_logs"
ON public.ai_content_logs FOR INSERT TO authenticated WITH CHECK (true);
