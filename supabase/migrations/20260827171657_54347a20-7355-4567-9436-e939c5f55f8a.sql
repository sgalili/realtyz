ALTER TABLE public.fb_user_groups ADD COLUMN IF NOT EXISTS max_posts_per_day integer;

CREATE TABLE IF NOT EXISTS public.fb_group_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  group_id text NOT NULL,
  posted_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jerusalem')::date,
  post_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_owner_id, group_id, posted_on)
);

GRANT SELECT ON public.fb_group_post_log TO authenticated;
GRANT ALL ON public.fb_group_post_log TO service_role;
ALTER TABLE public.fb_group_post_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members read group post log" ON public.fb_group_post_log;
CREATE POLICY "workspace members read group post log"
ON public.fb_group_post_log FOR SELECT TO authenticated
USING (public.can_access_workspace_owner(workspace_owner_id));

CREATE OR REPLACE FUNCTION public.claim_fb_group_post_slot(_owner uuid, _group text, _limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  _current integer;
BEGIN
  IF _limit IS NULL OR _limit <= 0 THEN
    -- No cap configured: still count the post for reporting.
    INSERT INTO public.fb_group_post_log (workspace_owner_id, group_id, posted_on, post_count)
    VALUES (_owner, _group, _today, 1)
    ON CONFLICT (workspace_owner_id, group_id, posted_on)
    DO UPDATE SET post_count = public.fb_group_post_log.post_count + 1, updated_at = now();
    RETURN true;
  END IF;

  INSERT INTO public.fb_group_post_log (workspace_owner_id, group_id, posted_on, post_count)
  VALUES (_owner, _group, _today, 0)
  ON CONFLICT (workspace_owner_id, group_id, posted_on) DO NOTHING;

  SELECT post_count INTO _current
  FROM public.fb_group_post_log
  WHERE workspace_owner_id = _owner AND group_id = _group AND posted_on = _today
  FOR UPDATE;

  IF COALESCE(_current, 0) >= _limit THEN
    RETURN false;
  END IF;

  UPDATE public.fb_group_post_log
  SET post_count = post_count + 1, updated_at = now()
  WHERE workspace_owner_id = _owner AND group_id = _group AND posted_on = _today;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fb_group_post_slot(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fb_group_post_slot(uuid, text, integer) TO service_role;