CREATE TABLE public.notification_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_owner_id uuid,
  notif_key text NOT NULL,
  is_read boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, notif_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_states TO authenticated;
GRANT ALL ON public.notification_states TO service_role;

ALTER TABLE public.notification_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notification state"
ON public.notification_states FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_notification_states_updated_at
BEFORE UPDATE ON public.notification_states
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_notification_states_user ON public.notification_states (user_id, notif_key);