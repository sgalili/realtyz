ALTER TABLE public.fb_user_groups
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS fb_user_groups_ws_blocked_idx ON public.fb_user_groups (workspace_owner_id, is_blocked);

-- Auto-blacklist: a group-post job that fails with a restriction-type error
-- (or fails 3 times in a row) marks the workspace's group as blocked.
CREATE OR REPLACE FUNCTION public.fb_group_autoblock_on_failure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gid text;
  err text := lower(coalesce(NEW.last_error, ''));
  restricted boolean;
BEGIN
  IF NEW.activity_type <> 'fb_group_post' THEN RETURN NEW; END IF;
  gid := substring(coalesce(NEW.target_ref, '') from 'groups/([A-Za-z0-9._-]+)');
  IF gid IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.fb_user_groups SET fail_count = 0
     WHERE workspace_owner_id = NEW.workspace_owner_id
       AND regexp_replace(group_id, '^(ext:|manual:)', '') = gid AND fail_count > 0;
    RETURN NEW;
  END IF;

  IF NEW.status <> 'failed' OR OLD.status = 'failed' THEN RETURN NEW; END IF;

  restricted := err ~ '(restrict|blocked|banned|not_member|not a member|no_composer|composer_not_found|posting_disabled|admin_approval|pending_approval|suspend|חסום|מוגבל|אין הרשאה|לא חבר)';

  UPDATE public.fb_user_groups
     SET fail_count = fail_count + 1,
         is_blocked = CASE WHEN restricted OR fail_count + 1 >= 3 THEN true ELSE is_blocked END,
         blocked_at = CASE WHEN (restricted OR fail_count + 1 >= 3) AND NOT is_blocked THEN now() ELSE blocked_at END,
         blocked_reason = CASE WHEN (restricted OR fail_count + 1 >= 3) AND NOT is_blocked
                               THEN left(coalesce(NEW.last_error, 'כשלונות חוזרים'), 300) ELSE blocked_reason END,
         is_selected = CASE WHEN restricted OR fail_count + 1 >= 3 THEN false ELSE is_selected END,
         updated_at = now()
   WHERE workspace_owner_id = NEW.workspace_owner_id
     AND regexp_replace(group_id, '^(ext:|manual:)', '') = gid;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fb_group_autoblock ON public.campaign_activity_queue;
CREATE TRIGGER trg_fb_group_autoblock
AFTER UPDATE OF status ON public.campaign_activity_queue
FOR EACH ROW EXECUTE FUNCTION public.fb_group_autoblock_on_failure();