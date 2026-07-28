CREATE TABLE IF NOT EXISTS public.wa_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  language text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'APPROVED',
  body_text text NOT NULL DEFAULT '',
  variable_count integer NOT NULL DEFAULT 0,
  has_header_variable boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, name, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_message_templates TO authenticated;
GRANT ALL ON public.wa_message_templates TO service_role;

ALTER TABLE public.wa_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read cached WA templates"
ON public.wa_message_templates FOR SELECT TO authenticated
USING (public.can_access_workspace_owner(owner_user_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Workspace members manage cached WA templates"
ON public.wa_message_templates FOR ALL TO authenticated
USING (public.can_access_workspace_owner(owner_user_id) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.can_access_workspace_owner(owner_user_id) OR public.has_role(auth.uid(), 'super_admin'));