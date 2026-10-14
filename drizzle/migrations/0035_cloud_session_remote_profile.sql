ALTER TABLE public.fb_cloud_sessions ADD COLUMN IF NOT EXISTS remote_profile_id text;
ALTER TABLE public.fb_cloud_sessions ALTER COLUMN cookies_encrypted DROP NOT NULL;