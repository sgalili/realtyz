CREATE OR REPLACE FUNCTION public.release_fb_group_post_slot(_owner uuid, _group text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.fb_group_post_log
  SET post_count = GREATEST(0, post_count - 1), updated_at = now()
  WHERE workspace_owner_id = _owner
    AND group_id = _group
    AND posted_on = (now() AT TIME ZONE 'Asia/Jerusalem')::date;
$$;

REVOKE ALL ON FUNCTION public.release_fb_group_post_slot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_fb_group_post_slot(uuid, text) TO service_role;