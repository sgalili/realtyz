CREATE TABLE IF NOT EXISTS public.extension_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_id uuid NOT NULL,
  created_by uuid,
  token text NOT NULL UNIQUE,
  label text,
  user_agent text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_pairings TO authenticated;
GRANT ALL ON public.extension_pairings TO service_role;

ALTER TABLE public.extension_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read pairings"
  ON public.extension_pairings FOR SELECT TO authenticated
  USING (public.can_access_workspace_owner(workspace_owner_id));

CREATE POLICY "workspace members create pairings"
  ON public.extension_pairings FOR INSERT TO authenticated
  WITH CHECK (public.can_access_workspace_owner(workspace_owner_id) AND created_by = auth.uid());

CREATE POLICY "workspace members update pairings"
  ON public.extension_pairings FOR UPDATE TO authenticated
  USING (public.can_access_workspace_owner(workspace_owner_id))
  WITH CHECK (public.can_access_workspace_owner(workspace_owner_id));

CREATE POLICY "workspace members delete pairings"
  ON public.extension_pairings FOR DELETE TO authenticated
  USING (public.can_access_workspace_owner(workspace_owner_id));

CREATE INDEX IF NOT EXISTS extension_pairings_ws_idx ON public.extension_pairings (workspace_owner_id);

CREATE TRIGGER extension_pairings_touch
  BEFORE UPDATE ON public.extension_pairings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.campaign_activity_queue
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.ext_create_pairing(_label text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  _token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.extension_pairings (workspace_owner_id, created_by, token, label)
  VALUES (_uid, _uid, _token, _label)
  RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'token', _token);
END;
$$;

REVOKE ALL ON FUNCTION public.ext_create_pairing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ext_create_pairing(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ext_is_active(_ws uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.extension_pairings
    WHERE workspace_owner_id = _ws
      AND revoked_at IS NULL
      AND last_seen_at > now() - interval '6 minutes'
  );
$$;

REVOKE ALL ON FUNCTION public.ext_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ext_is_active(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ext_claim_jobs(_token text, _limit integer DEFAULT 2, _user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pair public.extension_pairings;
  _jobs jsonb;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings
  WHERE token = _token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  UPDATE public.extension_pairings
  SET last_seen_at = now(),
      user_agent = COALESCE(_user_agent, user_agent)
  WHERE id = _pair.id;

  -- Release jobs whose browser hold expired so nothing stays stuck.
  UPDATE public.campaign_activity_queue
  SET status = 'pending',
      claimed_by = NULL,
      claim_expires_at = NULL,
      last_error = COALESCE(last_error, 'תם הזמן להרצה בדפדפן — הפוסט חוזר לתור')
  WHERE workspace_owner_id = _pair.workspace_owner_id
    AND activity_type = 'fb_group_post'
    AND status = 'processing'
    AND claim_expires_at IS NOT NULL
    AND claim_expires_at < now();

  WITH due AS (
    SELECT id FROM public.campaign_activity_queue
    WHERE workspace_owner_id = _pair.workspace_owner_id
      AND activity_type = 'fb_group_post'
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 2), 5))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.campaign_activity_queue q
    SET status = 'processing',
        claimed_by = _pair.id,
        claim_expires_at = now() + interval '10 minutes',
        processed_at = now(),
        attempts = COALESCE(q.attempts, 0) + 1
    FROM due
    WHERE q.id = due.id
    RETURNING q.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'group_id', c.target_ref,
    'group_name', c.target_label,
    'group_url', COALESCE(c.payload->>'group_url', 'https://www.facebook.com/groups/' || c.target_ref),
    'message', COALESCE(NULLIF(c.payload->>'outbound_text', ''), NULLIF(c.payload->>'body', ''), c.payload->>'text', ''),
    'image_url', c.payload->>'image_url',
    'link', c.payload->>'link',
    'first_comment', c.payload->>'first_comment',
    'attempts', c.attempts
  )), '[]'::jsonb) INTO _jobs FROM claimed c;

  RETURN jsonb_build_object('ok', true, 'workspace_owner_id', _pair.workspace_owner_id, 'jobs', _jobs);
END;
$$;

REVOKE ALL ON FUNCTION public.ext_claim_jobs(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ext_claim_jobs(text, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ext_report_job(
  _token text,
  _job_id uuid,
  _ok boolean,
  _reason text DEFAULT NULL,
  _post_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pair public.extension_pairings;
  _row public.campaign_activity_queue;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings
  WHERE token = _token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  UPDATE public.extension_pairings SET last_seen_at = now() WHERE id = _pair.id;

  SELECT * INTO _row FROM public.campaign_activity_queue
  WHERE id = _job_id AND workspace_owner_id = _pair.workspace_owner_id;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_not_found');
  END IF;

  IF _ok THEN
    UPDATE public.campaign_activity_queue
    SET status = 'completed',
        publication_status = 'published',
        completed_at = now(),
        claimed_by = NULL,
        claim_expires_at = NULL,
        last_error = NULL,
        payload = COALESCE(payload, '{}'::jsonb)
          || jsonb_build_object('published_via', 'browser_extension')
          || CASE WHEN _post_url IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fb_post_url', _post_url) END
    WHERE id = _row.id;

    BEGIN
      INSERT INTO public.campaign_logs (
        user_id, workspace_owner_id, campaign_name, channel, status,
        message_body, group_ids, sent_at
      ) VALUES (
        COALESCE(_row.created_by, _row.workspace_owner_id),
        _row.workspace_owner_id,
        'קבוצת פייסבוק · ' || COALESCE(_row.target_label, _row.target_ref, ''),
        'facebook',
        'sent',
        COALESCE(_row.payload->>'outbound_text', _row.payload->>'body', ''),
        ARRAY[_row.target_ref],
        now()
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;

    RETURN jsonb_build_object('ok', true, 'status', 'completed');
  END IF;

  IF COALESCE(_row.attempts, 0) < 3 THEN
    UPDATE public.campaign_activity_queue
    SET status = 'pending',
        claimed_by = NULL,
        claim_expires_at = NULL,
        scheduled_for = now() + interval '15 minutes',
        last_error = COALESCE(NULLIF(_reason, ''), 'פרסום בדפדפן נכשל')
    WHERE id = _row.id;
    RETURN jsonb_build_object('ok', true, 'status', 'retry');
  END IF;

  UPDATE public.campaign_activity_queue
  SET status = 'failed',
      publication_status = 'failed',
      claimed_by = NULL,
      claim_expires_at = NULL,
      last_error = COALESCE(NULLIF(_reason, ''), 'פרסום בדפדפן נכשל')
  WHERE id = _row.id;
  RETURN jsonb_build_object('ok', true, 'status', 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.ext_report_job(text, uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ext_report_job(text, uuid, boolean, text, text) TO service_role;