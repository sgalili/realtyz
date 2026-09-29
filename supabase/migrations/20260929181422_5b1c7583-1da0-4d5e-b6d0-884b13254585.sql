CREATE TABLE public.outbound_emails_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid,
  sent_by uuid,
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  body_text text,
  provider text NOT NULL,
  provider_message_id text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbound_emails_log_ws_idx ON public.outbound_emails_log (workspace_owner_id, created_at DESC);
GRANT SELECT ON public.outbound_emails_log TO authenticated;
GRANT ALL ON public.outbound_emails_log TO service_role;
ALTER TABLE public.outbound_emails_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace reads own sent mail" ON public.outbound_emails_log FOR SELECT TO authenticated
USING (workspace_owner_id = public.current_workspace_owner() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Broker reads own inbound" ON public.inbound_emails_log;
CREATE POLICY "Workspace reads own inbound" ON public.inbound_emails_log FOR SELECT TO authenticated
USING (matched_broker_user_id = public.current_workspace_owner() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));