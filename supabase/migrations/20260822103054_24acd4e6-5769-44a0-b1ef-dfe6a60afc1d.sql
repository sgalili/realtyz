CREATE TABLE IF NOT EXISTS public.workspace_whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null unique references auth.users(id) on delete cascade,
  connection_type text not null default 'official_meta' check (connection_type in ('official_meta','qr_session')),
  green_api_instance_id text,
  green_api_token text,
  qr_status text not null default 'disconnected' check (qr_status in ('disconnected','pending','connected','error')),
  qr_phone text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_whatsapp_settings TO authenticated;
GRANT ALL ON public.workspace_whatsapp_settings TO service_role;

ALTER TABLE public.workspace_whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view whatsapp settings"
ON public.workspace_whatsapp_settings FOR SELECT TO authenticated
USING (
  workspace_owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.user_id = auth.uid() AND m.workspace_owner_id = workspace_whatsapp_settings.workspace_owner_id
  )
);

CREATE POLICY "Workspace members can insert whatsapp settings"
ON public.workspace_whatsapp_settings FOR INSERT TO authenticated
WITH CHECK (
  workspace_owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.user_id = auth.uid() AND m.workspace_owner_id = workspace_whatsapp_settings.workspace_owner_id
  )
);

CREATE POLICY "Workspace members can update whatsapp settings"
ON public.workspace_whatsapp_settings FOR UPDATE TO authenticated
USING (
  workspace_owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.user_id = auth.uid() AND m.workspace_owner_id = workspace_whatsapp_settings.workspace_owner_id
  )
);

CREATE POLICY "Owner can delete whatsapp settings"
ON public.workspace_whatsapp_settings FOR DELETE TO authenticated
USING (workspace_owner_id = auth.uid());

CREATE TRIGGER trg_wa_ws_settings_updated_at
BEFORE UPDATE ON public.workspace_whatsapp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();