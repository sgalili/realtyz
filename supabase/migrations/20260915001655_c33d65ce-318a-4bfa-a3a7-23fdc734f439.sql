ALTER TABLE public.workspace_sms_settings ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE public.workspace_sms_settings ALTER COLUMN password DROP NOT NULL;