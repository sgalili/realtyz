
-- Merge helper: fold source lead into target and delete source. Used to keep
-- one CRM profile per person when a unique social identifier ties two
-- profiles together (e.g., new inbound Messenger comment matches an existing
-- lead's stored messenger_id / instagram_handle).
CREATE OR REPLACE FUNCTION public.merge_lead_into(_source uuid, _target uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.leads%ROWTYPE;
  tgt public.leads%ROWTYPE;
BEGIN
  IF _source = _target THEN RETURN _target; END IF;
  SELECT * INTO src FROM public.leads WHERE id = _source;
  SELECT * INTO tgt FROM public.leads WHERE id = _target;
  IF src.id IS NULL OR tgt.id IS NULL THEN RETURN _target; END IF;

  -- Coalesce identifier + demographic columns onto the target (target wins on conflicts).
  UPDATE public.leads SET
    phone_number      = COALESCE(tgt.phone_number, src.phone_number),
    full_name         = COALESCE(NULLIF(tgt.full_name, ''), src.full_name),
    email             = COALESCE(NULLIF(tgt.email, ''), src.email),
    city              = COALESCE(NULLIF(tgt.city, ''), src.city),
    address           = COALESCE(NULLIF(tgt.address, ''), src.address),
    neighborhood      = COALESCE(NULLIF(tgt.neighborhood, ''), src.neighborhood),
    identity_number   = COALESCE(NULLIF(tgt.identity_number, ''), src.identity_number),
    telegram_username = COALESCE(NULLIF(tgt.telegram_username, ''), src.telegram_username),
    instagram_handle  = COALESCE(NULLIF(tgt.instagram_handle, ''), src.instagram_handle),
    messenger_id      = COALESCE(NULLIF(tgt.messenger_id, ''), src.messenger_id),
    profile_picture_url = COALESCE(NULLIF(tgt.profile_picture_url, ''), src.profile_picture_url),
    preferences       = COALESCE(tgt.preferences, '{}'::jsonb) || COALESCE(src.preferences, '{}'::jsonb),
    engagement_score  = GREATEST(COALESCE(tgt.engagement_score, 0), COALESCE(src.engagement_score, 0))
  WHERE id = _target;

  -- Repoint child rows across common FK tables (best-effort — silently skip
  -- tables/columns that don't exist so the function is safe to call anywhere).
  BEGIN UPDATE public.messages              SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.chat_history          SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.approval_queue        SET target_voter_id = _target WHERE target_voter_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.campaign_logs         SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.engagement_events     SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.interaction_activity_log SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.fb_comments           SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.deal_room_comments    SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.trial_inbound_replies SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN UPDATE public.notifications         SET lead_id = _target WHERE lead_id = _source; EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  DELETE FROM public.leads WHERE id = _source;
  RETURN _target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_lead_into(uuid, uuid) TO authenticated, service_role;

-- Upsert-by-social-identity: find existing lead by any provided social handle
-- and update it; if none matches, target the lead specified by _hint_lead_id.
-- Returns the surviving lead id. Webhooks call this on inbound comment/DM.
CREATE OR REPLACE FUNCTION public.upsert_lead_by_social(
  _hint_lead_id uuid,
  _messenger_id text DEFAULT NULL,
  _instagram_handle text DEFAULT NULL,
  _telegram_username text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _full_name text DEFAULT NULL,
  _profile_picture_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_id uuid;
BEGIN
  -- Try to find an existing lead by any unique-ish identifier.
  SELECT id INTO match_id FROM public.leads WHERE
    (_messenger_id IS NOT NULL      AND messenger_id      = _messenger_id) OR
    (_instagram_handle IS NOT NULL  AND instagram_handle  = _instagram_handle) OR
    (_telegram_username IS NOT NULL AND telegram_username = _telegram_username) OR
    (_email IS NOT NULL             AND lower(email) = lower(_email)) OR
    (_phone IS NOT NULL             AND phone_number = _phone)
  ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  -- Merge or route to hint.
  IF match_id IS NULL THEN
    match_id := _hint_lead_id;
  ELSIF _hint_lead_id IS NOT NULL AND _hint_lead_id <> match_id THEN
    -- Duplicate detected: fold hint lead into the older/match lead.
    PERFORM public.merge_lead_into(_hint_lead_id, match_id);
  END IF;

  IF match_id IS NOT NULL THEN
    UPDATE public.leads SET
      messenger_id        = COALESCE(NULLIF(messenger_id, ''), _messenger_id),
      instagram_handle    = COALESCE(NULLIF(instagram_handle, ''), _instagram_handle),
      telegram_username   = COALESCE(NULLIF(telegram_username, ''), _telegram_username),
      email               = COALESCE(NULLIF(email, ''), _email),
      full_name           = COALESCE(NULLIF(full_name, ''), _full_name),
      profile_picture_url = COALESCE(NULLIF(profile_picture_url, ''), _profile_picture_url),
      last_interaction_at = now()
    WHERE id = match_id;
  END IF;

  RETURN match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lead_by_social(uuid, text, text, text, text, text, text, text) TO authenticated, service_role;
