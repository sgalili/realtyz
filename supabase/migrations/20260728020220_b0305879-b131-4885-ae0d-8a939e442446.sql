
-- 1. Unified contact resolver -------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_lead_from_interaction(
  _platform text,
  _handle text DEFAULT NULL,
  _external_id text DEFAULT NULL,
  _full_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _avatar text DEFAULT NULL,
  _owner uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_phone text := NULLIF(regexp_replace(COALESCE(_phone,''), '\D', '', 'g'), '');
  v_handle text := NULLIF(btrim(COALESCE(_handle, '')), '');
  v_ext text := NULLIF(btrim(COALESCE(_external_id, '')), '');
  v_email text := NULLIF(lower(btrim(COALESCE(_email, ''))), '');
BEGIN
  IF v_phone IS NULL AND v_handle IS NULL AND v_ext IS NULL AND v_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- Match by phone
  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_id FROM leads
    WHERE regexp_replace(phone_number, '\D', '', 'g') = v_phone LIMIT 1;
  END IF;

  -- Match by email
  IF v_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_id FROM leads WHERE lower(email) = v_email LIMIT 1;
  END IF;

  -- Match by social identity
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM leads
    WHERE (v_handle IS NOT NULL AND (instagram_handle = v_handle OR telegram_username = v_handle))
       OR (v_ext IS NOT NULL AND (messenger_id = v_ext OR messenger_psid = v_ext OR instagram_psid = v_ext))
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO leads (
      phone_number, full_name, email, profile_picture_url, assigned_to,
      instagram_handle, telegram_username, messenger_id,
      status, lead_stage, interest_tag, last_interaction_at
    ) VALUES (
      COALESCE(v_phone, 'new-' || (extract(epoch from now())*1000)::bigint || '-' || substr(md5(random()::text),1,6)),
      COALESCE(NULLIF(btrim(COALESCE(_full_name,'')), ''), 'לקוח חדש'),
      v_email,
      NULLIF(btrim(COALESCE(_avatar,'')), ''),
      _owner,
      CASE WHEN _platform = 'instagram' THEN v_handle END,
      CASE WHEN _platform = 'telegram' THEN v_handle END,
      CASE WHEN _platform IN ('facebook','messenger') THEN COALESCE(v_ext, v_handle) END,
      'lead', 'new', _platform, now()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE leads SET
      full_name = CASE WHEN (full_name IS NULL OR full_name IN ('', 'לקוח חדש'))
                         AND NULLIF(btrim(COALESCE(_full_name,'')),'') IS NOT NULL
                       THEN _full_name ELSE full_name END,
      email = COALESCE(email, v_email),
      profile_picture_url = COALESCE(profile_picture_url, NULLIF(btrim(COALESCE(_avatar,'')), '')),
      assigned_to = COALESCE(assigned_to, _owner),
      instagram_handle = CASE WHEN _platform = 'instagram' THEN COALESCE(instagram_handle, v_handle) ELSE instagram_handle END,
      telegram_username = CASE WHEN _platform = 'telegram' THEN COALESCE(telegram_username, v_handle) ELSE telegram_username END,
      messenger_id = CASE WHEN _platform IN ('facebook','messenger') THEN COALESCE(messenger_id, v_ext, v_handle) ELSE messenger_id END,
      last_interaction_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- 2. Duplicate protection for mirrored interactions ---------------------------
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_unique_idx
  ON public.messages ((metadata->>'external_id'))
  WHERE metadata->>'external_id' IS NOT NULL;

-- 3. Unified history recorder -------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_interaction_message(
  _lead_id uuid,
  _platform text,
  _direction text,
  _sender_type text,
  _content text,
  _external_id text DEFAULT NULL,
  _created_at timestamptz DEFAULT now(),
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_platform text := CASE WHEN _platform IN ('whatsapp','sms','instagram','telegram','messenger','tiktok','email','facebook','linkedin')
                          THEN _platform ELSE 'facebook' END;
BEGIN
  IF _lead_id IS NULL OR NULLIF(btrim(COALESCE(_content,'')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO messages (lead_id, direction, sender_type, content, channel, platform, created_at, metadata)
  VALUES (
    _lead_id, _direction, _sender_type, _content, v_platform, v_platform,
    COALESCE(_created_at, now()),
    COALESCE(_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('external_id', _external_id, 'source', v_platform))
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  UPDATE leads SET last_interaction_at = GREATEST(COALESCE(last_interaction_at, now()), COALESCE(_created_at, now()))
  WHERE id = _lead_id;

  RETURN v_id;
END;
$$;

-- 4. Facebook comments --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_fb_comment_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead uuid;
BEGIN
  v_lead := public.upsert_lead_from_interaction(
    'facebook', NEW.author_name, NEW.author_fb_id, NEW.author_name, NULL, NULL,
    NULLIF(NEW.raw->>'author_picture', ''), NULL
  );
  IF v_lead IS NOT NULL THEN
    PERFORM public.record_interaction_message(
      v_lead, 'facebook', 'inbound', 'voter', NEW.comment_text,
      'fb_comment:' || COALESCE(NEW.ayr_comment_id, NEW.id::text),
      COALESCE(NEW.posted_at, now()),
      jsonb_build_object('kind', 'comment', 'fb_comment_id', NEW.ayr_comment_id, 'post_id', NEW.post_id)
    );
    IF NEW.is_historical_replied AND NULLIF(btrim(COALESCE(NEW.historical_reply_text,'')),'') IS NOT NULL THEN
      PERFORM public.record_interaction_message(
        v_lead, 'facebook', 'outbound', 'agent', NEW.historical_reply_text,
        'fb_comment_reply:' || COALESCE(NEW.ayr_comment_id, NEW.id::text),
        COALESCE(NEW.posted_at, now()),
        jsonb_build_object('kind', 'comment_reply')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_fb_comment_to_crm ON public.fb_comments;
CREATE TRIGGER trg_sync_fb_comment_to_crm
AFTER INSERT ON public.fb_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_fb_comment_to_crm();

-- 5. Replies we post back on comments ----------------------------------------
CREATE OR REPLACE FUNCTION public.sync_fb_comment_reply_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_lead uuid;
BEGIN
  SELECT * INTO c FROM fb_comments WHERE id = NEW.comment_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_lead := public.upsert_lead_from_interaction(
    'facebook', c.author_name, c.author_fb_id, c.author_name, NULL, NULL, NULL, NEW.posted_by
  );
  PERFORM public.record_interaction_message(
    v_lead, 'facebook', 'outbound',
    CASE WHEN NEW.mode = 'ai' THEN 'ai' ELSE 'agent' END,
    NEW.final_text,
    'fb_reply:' || COALESCE(NEW.ayrshare_reply_id, NEW.id::text),
    COALESCE(NEW.posted_at, now()),
    jsonb_build_object('kind', 'comment_reply')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_fb_comment_reply_to_crm ON public.fb_comment_replies;
CREATE TRIGGER trg_sync_fb_comment_reply_to_crm
AFTER INSERT ON public.fb_comment_replies
FOR EACH ROW EXECUTE FUNCTION public.sync_fb_comment_reply_to_crm();

-- 6. Cross-channel engagement events (DMs, comments from any network) ---------
CREATE OR REPLACE FUNCTION public.sync_engagement_event_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead uuid := NEW.lead_id;
BEGIN
  IF v_lead IS NULL THEN
    v_lead := public.upsert_lead_from_interaction(
      NEW.platform,
      NEW.sender_handle,
      COALESCE(NEW.metadata->>'sender_id', NEW.external_id),
      COALESCE(NEW.metadata->>'sender_name', NEW.sender_handle),
      NEW.metadata->>'sender_phone',
      NEW.metadata->>'sender_email',
      NEW.metadata->>'sender_avatar',
      NEW.user_id
    );
    IF v_lead IS NOT NULL THEN
      UPDATE engagement_events SET lead_id = v_lead WHERE id = NEW.id;
    END IF;
  END IF;

  IF v_lead IS NOT NULL THEN
    PERFORM public.record_interaction_message(
      v_lead, NEW.platform, 'inbound', 'voter', NEW.inbound_text,
      'engagement_in:' || NEW.id::text, COALESCE(NEW.created_at, now()),
      jsonb_build_object('kind', COALESCE(NEW.metadata->>'kind', 'engagement'))
    );
    PERFORM public.record_interaction_message(
      v_lead, NEW.platform, 'outbound', 'ai', NEW.ai_reply_text,
      'engagement_out:' || NEW.id::text, COALESCE(NEW.created_at, now()),
      jsonb_build_object('kind', 'engagement_reply')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_engagement_event_to_crm ON public.engagement_events;
CREATE TRIGGER trg_sync_engagement_event_to_crm
AFTER INSERT ON public.engagement_events
FOR EACH ROW EXECUTE FUNCTION public.sync_engagement_event_to_crm();

-- 7. Social listening mentions ------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_social_listening_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead uuid;
  v_platform text := CASE
    WHEN NEW.source_platform IN ('instagram','facebook','linkedin','tiktok','telegram','messenger') THEN NEW.source_platform
    ELSE 'facebook' END;
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.author_handle,'')),'') IS NULL THEN RETURN NEW; END IF;

  v_lead := public.upsert_lead_from_interaction(
    v_platform, NEW.author_handle, NEW.metadata->>'author_id',
    COALESCE(NEW.metadata->>'author_name', NEW.author_handle),
    NULL, NULL, NEW.metadata->>'author_avatar', NEW.user_id
  );
  PERFORM public.record_interaction_message(
    v_lead, v_platform, 'inbound', 'voter', NEW.content,
    'listening:' || NEW.id::text, COALESCE(NEW.created_at, now()),
    jsonb_build_object('kind', NEW.source_type, 'source_url', NEW.source_url)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_social_listening_to_crm ON public.social_listening_events;
CREATE TRIGGER trg_sync_social_listening_to_crm
AFTER INSERT ON public.social_listening_events
FOR EACH ROW EXECUTE FUNCTION public.sync_social_listening_to_crm();

GRANT EXECUTE ON FUNCTION public.upsert_lead_from_interaction(text,text,text,text,text,text,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_interaction_message(uuid,text,text,text,text,text,timestamptz,jsonb) TO authenticated, service_role;
