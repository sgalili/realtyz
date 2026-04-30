CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.survey_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  source_filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  top_concerns JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment_by_area JSONB NOT NULL DEFAULT '[]'::jsonb,
  weak_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  swing_voters JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own survey_insights"
ON public.survey_insights
FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_survey_insights_user_created ON public.survey_insights(user_id, created_at DESC);

CREATE TRIGGER update_survey_insights_updated_at
BEFORE UPDATE ON public.survey_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meta_ad_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'engagement',
  audience_type TEXT NOT NULL DEFAULT 'supporters',
  daily_budget NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  creative_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_campaign_id TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meta_ad_campaigns"
ON public.meta_ad_campaigns
FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_meta_ad_campaigns_user_created ON public.meta_ad_campaigns(user_id, created_at DESC);

CREATE TRIGGER update_meta_ad_campaigns_updated_at
BEFORE UPDATE ON public.meta_ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();