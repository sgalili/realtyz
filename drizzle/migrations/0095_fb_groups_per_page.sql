ALTER TABLE public.fb_user_groups ADD COLUMN IF NOT EXISTS page_scope text GENERATED ALWAYS AS (coalesce(page_id, '')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS fb_user_groups_ws_page_group_key ON public.fb_user_groups (workspace_owner_id, page_scope, group_id);
ALTER TABLE public.fb_user_groups DROP CONSTRAINT IF EXISTS fb_user_groups_workspace_owner_id_group_id_key;
DROP INDEX IF EXISTS public.fb_user_groups_workspace_owner_id_group_id_key;