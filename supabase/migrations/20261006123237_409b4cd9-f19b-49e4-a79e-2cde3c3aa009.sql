ALTER TABLE public.fb_user_groups ALTER COLUMN join_status SET DEFAULT 'pending';
CREATE OR REPLACE FUNCTION public.fb_user_groups_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fb_user_groups WHERE workspace_owner_id = NEW.workspace_owner_id AND group_id = NEW.group_id) THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM fb_user_groups WHERE workspace_owner_id = NEW.workspace_owner_id) >= 100 THEN
    RAISE EXCEPTION 'group_limit_reached' USING HINT = 'max 100 groups per workspace';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fb_user_groups_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS fb_user_groups_limit ON public.fb_user_groups;
CREATE TRIGGER fb_user_groups_limit BEFORE INSERT ON public.fb_user_groups FOR EACH ROW EXECUTE FUNCTION public.fb_user_groups_limit();