ALTER TABLE public.fb_user_groups
  ADD COLUMN IF NOT EXISTS page_id text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS fb_user_groups_ws_page_idx
  ON public.fb_user_groups (workspace_owner_id, page_id);