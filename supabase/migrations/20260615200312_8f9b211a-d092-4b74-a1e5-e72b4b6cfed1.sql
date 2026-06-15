ALTER TABLE public.custom_user_groups
  ADD COLUMN IF NOT EXISTS last_draft_body text;