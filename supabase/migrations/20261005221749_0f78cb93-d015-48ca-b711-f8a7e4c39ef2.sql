ALTER TABLE public.listing_lead_charges
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchase_price numeric;

CREATE OR REPLACE FUNCTION public.charge_lead_commission(
  _listing_id uuid, _tier integer, _affiliate_id uuid DEFAULT NULL, _reference_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.listings; v_owner uuid; v_gross numeric := 0; v_questions jsonb; v_extra integer := 0;
  v_net numeric; v_platform numeric; v_balance numeric;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'listing_not_found'); END IF;
  v_owner := COALESCE(l.workspace_owner_id, l.user_id);
  v_gross := CASE _tier WHEN 1 THEN COALESCE(l.affiliate_tier1_amount, 0)
    WHEN 2 THEN COALESCE(l.affiliate_tier2_amount, 0) WHEN 3 THEN COALESCE(l.affiliate_tier3_amount, 0) ELSE 0 END;
  IF _tier IN (2, 3) THEN
    v_questions := CASE WHEN _tier = 2 THEN COALESCE(l.contact_options -> 'questions', '[]'::jsonb)
      ELSE COALESCE(l.contact_options -> 'questions_phone', l.contact_options -> 'questions', '[]'::jsonb) END;
    IF jsonb_typeof(v_questions) = 'array' THEN v_extra := GREATEST(jsonb_array_length(v_questions) - 3, 0); END IF;
    v_gross := v_gross + (v_extra * 10);
  END IF;
  IF public.listing_daily_cap_reached(_listing_id) THEN
    INSERT INTO public.listing_lead_charges (listing_id, workspace_owner_id, affiliate_id, tier, gross, is_leftover, lead_id)
    VALUES (l.id, v_owner, _affiliate_id, _tier, v_gross, true, _reference_id);
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'leftover', true);
  END IF;
  INSERT INTO public.listing_lead_charges (listing_id, workspace_owner_id, affiliate_id, tier, gross, is_leftover, lead_id)
  VALUES (l.id, v_owner, _affiliate_id, _tier, v_gross, false, _reference_id);
  IF v_gross <= 0 THEN RETURN jsonb_build_object('ok', true, 'charged', 0); END IF;
  v_net := round(v_gross * 0.8); v_platform := v_gross - v_net;
  v_balance := public.add_credit(v_owner, -v_gross, 'affiliate_lead_charge', _reference_id, 'עמלת ליד שותפים · שלב ' || _tier::text);
  IF _affiliate_id IS NOT NULL THEN
    PERFORM public.add_credit(_affiliate_id, v_net, 'affiliate_lead_reward', _reference_id, 'תגמול ליד שותפים · שלב ' || _tier::text);
  END IF;
  RETURN jsonb_build_object('ok', true, 'charged', v_gross, 'extra_questions', v_extra, 'partner_net', v_net,
    'platform_fee', v_platform, 'balance', v_balance, 'locked', v_balance < 0);
END; $$;
REVOKE ALL ON FUNCTION public.charge_lead_commission(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_lead_commission(uuid, integer, uuid, uuid) TO service_role;

-- Price of a leftover lead after the bringing partner's discount.
CREATE OR REPLACE FUNCTION public.leftover_lead_price(_charge_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0, round(CASE
    WHEN r.leftover_discount_type = 'fixed' THEN c.gross - COALESCE(r.leftover_discount_value, 0)
    ELSE c.gross * (1 - LEAST(COALESCE(r.leftover_discount_value, 0), 100) / 100.0) END))
  FROM public.listing_lead_charges c
  LEFT JOIN LATERAL (SELECT * FROM public.affiliate_referrals ar
    WHERE ar.affiliate_id = c.affiliate_id AND ar.listing_id = c.listing_id ORDER BY ar.created_at DESC LIMIT 1) r ON true
  WHERE c.id = _charge_id
$$;
REVOKE ALL ON FUNCTION public.leftover_lead_price(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leftover_lead_price(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_leftover_leads()
RETURNS TABLE(id uuid, listing_id uuid, listing_label text, tier integer, gross numeric, price numeric,
  lead_name text, lead_phone text, created_at timestamptz, purchased_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.listing_id,
    COALESCE(NULLIF(trim(concat_ws(' ', l.address, l.house_number, l.city)), ''), l.property_title, 'נכס'),
    c.tier, c.gross, COALESCE(c.purchase_price, public.leftover_lead_price(c.id)),
    ld.full_name,
    CASE WHEN c.purchased_at IS NOT NULL THEN ld.phone_number
      WHEN ld.phone_number IS NULL THEN NULL ELSE '•••••' || right(ld.phone_number, 3) END,
    c.created_at, c.purchased_at
  FROM public.listing_lead_charges c
  JOIN public.listings l ON l.id = c.listing_id
  LEFT JOIN public.leads ld ON ld.id = c.lead_id
  WHERE c.is_leftover AND c.workspace_owner_id = public.current_workspace_owner()
    AND public.can_access_workspace_owner(c.workspace_owner_id)
  ORDER BY c.purchased_at NULLS FIRST, c.created_at DESC
  LIMIT 500
$$;
REVOKE ALL ON FUNCTION public.list_leftover_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_leftover_leads() TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_leftover_lead(_charge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.listing_lead_charges; v_price numeric; v_balance numeric;
BEGIN
  SELECT * INTO c FROM public.listing_lead_charges WHERE id = _charge_id FOR UPDATE;
  IF c.id IS NULL OR NOT c.is_leftover OR NOT public.can_access_workspace_owner(c.workspace_owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF c.purchased_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  v_price := COALESCE(public.leftover_lead_price(c.id), 0);
  IF v_price > 0 THEN
    v_balance := public.add_credit(c.workspace_owner_id, -v_price, 'affiliate_lead_charge', c.lead_id, 'רכישת ליד עודף · שלב ' || c.tier::text);
    IF c.affiliate_id IS NOT NULL THEN
      PERFORM public.add_credit(c.affiliate_id, round(v_price * 0.8), 'affiliate_lead_reward', c.lead_id, 'תגמול ליד עודף · שלב ' || c.tier::text);
    END IF;
  END IF;
  UPDATE public.listing_lead_charges SET purchased_at = now(), purchase_price = v_price WHERE id = c.id;
  RETURN jsonb_build_object('ok', true, 'charged', v_price, 'balance', v_balance);
END; $$;
REVOKE ALL ON FUNCTION public.purchase_leftover_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_leftover_lead(uuid) TO authenticated;

-- Partner sets the discount on their own referral.
CREATE OR REPLACE FUNCTION public.set_referral_leftover_discount(_referral_id uuid, _type text, _value numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _type NOT IN ('percent','fixed') OR _value IS NULL OR _value < 0 OR (_type = 'percent' AND _value > 100) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  UPDATE public.affiliate_referrals SET leftover_discount_type = _type, leftover_discount_value = _value, updated_at = now()
  WHERE id = _referral_id AND affiliate_id = auth.uid();
  RETURN jsonb_build_object('ok', FOUND);
END; $$;
REVOKE ALL ON FUNCTION public.set_referral_leftover_discount(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_referral_leftover_discount(uuid, text, numeric) TO authenticated;

-- Queue jobs tied to a capped property wait until the cap window clears.
CREATE OR REPLACE FUNCTION public.queue_listing_capped(_payload jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := _payload->>'listing_id';
BEGIN
  IF v IS NULL OR v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN public.listing_daily_cap_reached(v::uuid);
END; $$;
REVOKE ALL ON FUNCTION public.queue_listing_capped(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_listing_capped(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ext_claim_jobs(_token text, _limit integer DEFAULT 2, _user_agent text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _pair public.extension_pairings; _jobs jsonb;
BEGIN
  SELECT * INTO _pair FROM public.extension_pairings WHERE token = _token AND revoked_at IS NULL;
  IF _pair.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token'); END IF;
  UPDATE public.extension_pairings SET last_seen_at = now(), user_agent = COALESCE(_user_agent, user_agent) WHERE id = _pair.id;
  UPDATE public.campaign_activity_queue
  SET status = CASE WHEN COALESCE(attempts,0) >= 3 THEN 'failed' ELSE 'pending' END,
      claimed_by = NULL, claim_expires_at = NULL,
      last_error = CASE WHEN COALESCE(attempts,0) >= 3 THEN 'הפרסום נכשל אחרי 3 ניסיונות'
                        ELSE COALESCE(last_error, 'תם הזמן להרצה בדפדפן — הפוסט חוזר לתור') END
  WHERE workspace_owner_id = _pair.workspace_owner_id AND activity_type = 'fb_group_post'
    AND status = 'processing' AND claim_expires_at IS NOT NULL AND claim_expires_at < now()
    AND NOT (payload ? 'local_id');
  WITH due AS (
    SELECT id FROM public.campaign_activity_queue q
    WHERE workspace_owner_id = _pair.workspace_owner_id
      AND activity_type = 'fb_group_post'
      AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM public.fb_user_groups g WHERE g.workspace_owner_id=q.workspace_owner_id AND g.is_blocked AND public.fb_group_key(g.group_id)=public.fb_group_key(q.target_ref))
      AND NOT public.queue_listing_capped(q.payload)
      AND scheduled_for <= now()
      AND COALESCE(attempts, 0) < 3
      AND NOT (payload ? 'local_id')
    ORDER BY scheduled_for ASC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 2), 5))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.campaign_activity_queue q
    SET status = 'processing', claimed_by = _pair.id,
        claim_expires_at = now() + interval '10 minutes', processed_at = now(),
        attempts = COALESCE(q.attempts, 0) + 1
    FROM due WHERE q.id = due.id AND q.status = 'pending'
    RETURNING q.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'dedupe_key', c.id::text, 'group_id', c.target_ref, 'group_name', c.target_label,
    'group_url', COALESCE(c.payload->>'group_url', 'https://www.facebook.com/groups/' || c.target_ref),
    'message', COALESCE(NULLIF(c.payload->>'outbound_text', ''), NULLIF(c.payload->>'body', ''), c.payload->>'text', ''),
    'image_url', c.payload->>'image_url',
    'image_urls', CASE WHEN jsonb_typeof(c.payload->'media_urls') = 'array' THEN c.payload->'media_urls' ELSE '[]'::jsonb END,
    'link', c.payload->>'link',
    'first_comment', COALESCE(NULLIF(c.payload->>'first_comment', ''),
      CASE WHEN NULLIF(c.payload->>'link','') IS NOT NULL THEN 'לפרטים ויצירת קשר: ' || (c.payload->>'link') END),
    'attempts', c.attempts
  )), '[]'::jsonb) INTO _jobs FROM claimed c;
  RETURN jsonb_build_object('ok', true, 'workspace_owner_id', _pair.workspace_owner_id, 'jobs', _jobs);
END; $function$;

-- WhatsApp referral attribution: once per listing + phone per 24h.
CREATE OR REPLACE FUNCTION public.attribute_whatsapp_referral(_ref text, _phone text, _name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.affiliate_referrals; l public.listings; v_owner uuid; v_lead uuid; v_bill jsonb;
BEGIN
  SELECT * INTO r FROM public.affiliate_referrals WHERE tracking_code = _ref LIMIT 1;
  IF r.id IS NULL OR r.listing_id IS NULL OR coalesce(_phone,'') = '' THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO l FROM public.listings WHERE id = r.listing_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  v_owner := COALESCE(l.workspace_owner_id, l.user_id);
  SELECT id INTO v_lead FROM public.leads WHERE workspace_owner_id = v_owner AND phone_number = _phone LIMIT 1;
  IF v_lead IS NULL THEN
    INSERT INTO public.leads (workspace_owner_id, phone_number, full_name, city, deal_type, lead_stage, status, source, last_interaction_at)
    VALUES (v_owner, _phone, COALESCE(NULLIF(_name,''), _phone), l.city, CASE WHEN l.deal_type = 'rent' THEN 'rent' ELSE 'sale' END,
      'new', 'new', 'affiliate_whatsapp', now())
    RETURNING id INTO v_lead;
  END IF;
  IF EXISTS (SELECT 1 FROM public.listing_lead_charges WHERE listing_id = l.id AND lead_id = v_lead AND tier = 2
             AND created_at > now() - interval '24 hours') THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'lead_id', v_lead);
  END IF;
  UPDATE public.affiliate_referrals SET lead_id = COALESCE(lead_id, v_lead), updated_at = now() WHERE id = r.id;
  INSERT INTO public.interaction_activity_log (user_id, workspace_owner_id, thread_key, platform, action_type, actor_type, content, metadata)
  VALUES (v_owner, v_owner, 'affiliate-wa:' || l.id || ':' || _phone, 'whatsapp', 'affiliate_whatsapp_lead', 'system',
    'איש קשר חדש מ-WhatsApp דרך שותף', jsonb_build_object('listing_id', l.id, 'lead_id', v_lead, 'affiliate_id', r.affiliate_id, 'referral_id', r.id));
  v_bill := public.charge_lead_commission(l.id, 2, r.affiliate_id, v_lead);
  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead, 'workspace_owner_id', v_owner, 'billing', v_bill);
END; $$;
REVOKE ALL ON FUNCTION public.attribute_whatsapp_referral(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_whatsapp_referral(text, text, text) TO service_role;