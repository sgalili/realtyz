CREATE OR REPLACE FUNCTION public.merge_lead_pair(_primary uuid, _dup uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.leads;
  d public.leads;
  r record;
  merged_socials jsonb;
  merged_prefs jsonb;
  merged_source text;
BEGIN
  IF _primary IS NULL OR _dup IS NULL OR _primary = _dup THEN RETURN; END IF;

  SELECT * INTO p FROM public.leads WHERE id = _primary FOR UPDATE;
  SELECT * INTO d FROM public.leads WHERE id = _dup FOR UPDATE;
  IF p.id IS NULL OR d.id IS NULL THEN RETURN; END IF;

  -- Re-point every child record (chats, messages, meetings, documents, ...).
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('lead_id', 'matched_lead_id')
      AND c.table_name <> 'leads'
  LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.table_name, r.column_name, r.column_name)
        USING _primary, _dup;
    EXCEPTION WHEN unique_violation OR foreign_key_violation OR check_violation THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING _dup;
    END;
  END LOOP;

  SELECT coalesce(jsonb_agg(entry), '[]'::jsonb) INTO merged_socials
  FROM (
    SELECT DISTINCT ON (public.social_identity_key(entry->>'handle')) entry
    FROM (
      SELECT s AS entry
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(coalesce(p.preferences->'socials', '[]'::jsonb)) = 'array'
                  THEN p.preferences->'socials' ELSE '[]'::jsonb END) s
      UNION ALL
      SELECT s AS entry
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(coalesce(d.preferences->'socials', '[]'::jsonb)) = 'array'
                  THEN d.preferences->'socials' ELSE '[]'::jsonb END) s
    ) all_entries
    WHERE coalesce(btrim(entry->>'handle'), '') <> ''
  ) deduped;

  merged_source := coalesce(
    nullif(btrim(coalesce(p.preferences->>'source', '')), ''),
    nullif(btrim(coalesce(p.preferences->>'lead_source', '')), ''),
    nullif(btrim(coalesce(d.preferences->>'source', '')), ''),
    nullif(btrim(coalesce(d.preferences->>'lead_source', '')), '')
  );

  merged_prefs := coalesce(d.preferences, '{}'::jsonb) || coalesce(p.preferences, '{}'::jsonb);
  merged_prefs := merged_prefs || jsonb_build_object('socials', merged_socials);
  IF merged_source IS NOT NULL THEN
    merged_prefs := merged_prefs || jsonb_build_object('source', merged_source, 'lead_source', merged_source);
  END IF;
  merged_prefs := merged_prefs || jsonb_build_object(
    'merged_from',
    coalesce(
      CASE WHEN jsonb_typeof(coalesce(merged_prefs->'merged_from', '[]'::jsonb)) = 'array'
           THEN merged_prefs->'merged_from' ELSE '[]'::jsonb END, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'lead_id', _dup::text,
         'full_name', d.full_name,
         'merged_at', now()
       ))
  );

  -- Remove the duplicate first: the primary may adopt its phone / email, and
  -- those columns carry per-owner unique indexes.
  DELETE FROM public.leads WHERE id = _dup;

  UPDATE public.leads SET
    full_name           = coalesce(nullif(btrim(coalesce(p.full_name, '')), ''), d.full_name),
    phone_number        = coalesce(nullif(btrim(coalesce(p.phone_number, '')), ''), d.phone_number),
    email               = coalesce(nullif(btrim(coalesce(p.email, '')), ''), d.email),
    city                = coalesce(nullif(btrim(coalesce(p.city, '')), ''), d.city),
    address             = coalesce(nullif(btrim(coalesce(p.address, '')), ''), d.address),
    neighborhood        = coalesce(nullif(btrim(coalesce(p.neighborhood, '')), ''), d.neighborhood),
    identity_number     = coalesce(nullif(btrim(coalesce(p.identity_number, '')), ''), d.identity_number),
    gender              = coalesce(nullif(btrim(coalesce(p.gender, '')), ''), d.gender),
    profile_picture_url = coalesce(nullif(btrim(coalesce(p.profile_picture_url, '')), ''), d.profile_picture_url),
    instagram_handle    = coalesce(nullif(btrim(coalesce(p.instagram_handle, '')), ''), d.instagram_handle),
    instagram_psid      = coalesce(nullif(btrim(coalesce(p.instagram_psid, '')), ''), d.instagram_psid),
    messenger_id        = coalesce(nullif(btrim(coalesce(p.messenger_id, '')), ''), d.messenger_id),
    messenger_psid      = coalesce(nullif(btrim(coalesce(p.messenger_psid, '')), ''), d.messenger_psid),
    telegram_username   = coalesce(nullif(btrim(coalesce(p.telegram_username, '')), ''), d.telegram_username),
    deal_type           = coalesce(nullif(btrim(coalesce(p.deal_type, '')), ''), d.deal_type),
    lead_stage          = coalesce(nullif(btrim(coalesce(p.lead_stage, '')), ''), d.lead_stage),
    status              = coalesce(nullif(btrim(coalesce(p.status, '')), ''), d.status),
    interest_tag        = coalesce(nullif(btrim(coalesce(p.interest_tag, '')), ''), d.interest_tag),
    agency_name         = coalesce(nullif(btrim(coalesce(p.agency_name, '')), ''), d.agency_name),
    operating_area      = coalesce(nullif(btrim(coalesce(p.operating_area, '')), ''), d.operating_area),
    notes               = nullif(concat_ws(E'\n', nullif(btrim(coalesce(p.notes, '')), ''), nullif(btrim(coalesce(d.notes, '')), '')), ''),
    linked_listing_id   = coalesce(p.linked_listing_id, d.linked_listing_id),
    assigned_to         = coalesce(p.assigned_to, d.assigned_to),
    commission_amount   = coalesce(p.commission_amount, d.commission_amount),
    expected_close_date = coalesce(p.expected_close_date, d.expected_close_date),
    ai_autopilot        = coalesce(p.ai_autopilot, d.ai_autopilot),
    engagement_score    = greatest(coalesce(p.engagement_score, 0), coalesce(d.engagement_score, 0)),
    priority_score      = greatest(coalesce(p.priority_score, 0), coalesce(d.priority_score, 0)),
    last_interaction_at = greatest(coalesce(p.last_interaction_at, d.last_interaction_at),
                                   coalesce(d.last_interaction_at, p.last_interaction_at)),
    preferences         = merged_prefs
  WHERE id = _primary;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_lead_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_lead_pair(uuid, uuid) TO service_role;