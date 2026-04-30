CREATE TABLE public.scheduled_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  approval_queue_id UUID NULL REFERENCES public.approval_queue(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'social_post',
  channel TEXT NOT NULL DEFAULT 'facebook',
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  target_audience TEXT NULL,
  drip_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_limit INTEGER NOT NULL DEFAULT 0,
  send_window_start TIME NOT NULL DEFAULT '08:00',
  send_window_end TIME NOT NULL DEFAULT '20:00',
  stagger_min_minutes INTEGER NOT NULL DEFAULT 7,
  stagger_max_minutes INTEGER NOT NULL DEFAULT 23,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.drip_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  scheduled_item_id UUID NULL REFERENCES public.scheduled_items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'draft',
  daily_limit INTEGER NOT NULL DEFAULT 50,
  send_window_start TIME NOT NULL DEFAULT '08:00',
  send_window_end TIME NOT NULL DEFAULT '20:00',
  stagger_min_minutes INTEGER NOT NULL DEFAULT 7,
  stagger_max_minutes INTEGER NOT NULL DEFAULT 23,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scheduled_items"
ON public.scheduled_items
FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users manage own drip_campaigns"
ON public.drip_campaigns
FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_scheduled_items_user_date ON public.scheduled_items(user_id, scheduled_for ASC);
CREATE INDEX idx_scheduled_items_status ON public.scheduled_items(user_id, status, scheduled_for ASC);
CREATE INDEX idx_scheduled_items_approval ON public.scheduled_items(approval_queue_id) WHERE approval_queue_id IS NOT NULL;
CREATE INDEX idx_drip_campaigns_user_status ON public.drip_campaigns(user_id, status, created_at DESC);

CREATE TRIGGER update_scheduled_items_updated_at
BEFORE UPDATE ON public.scheduled_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drip_campaigns_updated_at
BEFORE UPDATE ON public.drip_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();