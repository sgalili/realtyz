ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS availability_check_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS availability_check_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS availability_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS distribution_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribution_paused_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'inquiry';

CREATE OR REPLACE FUNCTION public.lifecycle_rank(_s text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_position(ARRAY['uploaded','distributed','inquiry','tour_scheduled','tour_completed','negotiation','contract','closed'], _s), 0)
$$;

CREATE OR REPLACE FUNCTION public.advance_listing_stage(_listing uuid, _stage text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old text;
BEGIN
  IF _listing IS NULL OR public.lifecycle_rank(_stage) = 0 THEN RETURN; END IF;
  SELECT lifecycle_stage INTO v_old FROM public.listings WHERE id = _listing;
  UPDATE public.listings SET last_activity_at = now(),
    lifecycle_stage = CASE WHEN public.lifecycle_rank(_stage) > public.lifecycle_rank(lifecycle_stage) THEN _stage ELSE lifecycle_stage END,
    lifecycle_updated_at = CASE WHEN public.lifecycle_rank(_stage) > public.lifecycle_rank(lifecycle_stage) THEN now() ELSE lifecycle_updated_at END
  WHERE id = _listing;
  IF v_old IS NOT NULL AND public.lifecycle_rank(_stage) > public.lifecycle_rank(v_old) THEN
    INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
    VALUES ('listing_lifecycle_advanced', auth.uid(), 'listings', _listing::text, jsonb_build_object('from', v_old, 'to', _stage));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.advance_listing_stage(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lifecycle_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_stage text;
BEGIN
  IF TG_TABLE_NAME = 'affiliate_referrals' THEN PERFORM public.advance_listing_stage(NEW.listing_id, 'distributed');
  ELSIF TG_TABLE_NAME IN ('listing_lead_charges','public_listing_interest') THEN PERFORM public.advance_listing_stage(NEW.listing_id, 'inquiry');
  ELSIF TG_TABLE_NAME = 'property_tours' THEN
    v_stage := CASE WHEN NEW.status = 'completed' THEN 'tour_completed' ELSE 'tour_scheduled' END;
    PERFORM public.advance_listing_stage(NEW.listing_id, v_stage);
  ELSIF TG_TABLE_NAME = 'leads' THEN
    v_stage := CASE NEW.lead_stage WHEN 'touring' THEN 'tour_scheduled' WHEN 'negotiation' THEN 'negotiation'
      WHEN 'awaiting_signature' THEN 'contract' WHEN 'closed' THEN 'closed' ELSE NULL END;
    IF v_stage IS NOT NULL AND NEW.linked_listing_id IS NOT NULL THEN PERFORM public.advance_listing_stage(NEW.linked_listing_id, v_stage); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lc_referrals AFTER INSERT ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.lifecycle_event();
CREATE TRIGGER trg_lc_charges AFTER INSERT ON public.listing_lead_charges FOR EACH ROW EXECUTE FUNCTION public.lifecycle_event();
CREATE TRIGGER trg_lc_interest AFTER INSERT ON public.public_listing_interest FOR EACH ROW EXECUTE FUNCTION public.lifecycle_event();
CREATE TRIGGER trg_lc_tours AFTER INSERT OR UPDATE OF status ON public.property_tours FOR EACH ROW EXECUTE FUNCTION public.lifecycle_event();
CREATE TRIGGER trg_lc_leads AFTER UPDATE OF lead_stage ON public.leads FOR EACH ROW WHEN (OLD.lead_stage IS DISTINCT FROM NEW.lead_stage) EXECUTE FUNCTION public.lifecycle_event();

-- Lead lifecycle mirror
CREATE OR REPLACE FUNCTION public.lead_lifecycle_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  v := CASE NEW.lead_stage WHEN 'touring' THEN 'tour_scheduled' WHEN 'negotiation' THEN 'negotiation'
    WHEN 'awaiting_signature' THEN 'contract' WHEN 'closed' THEN 'closed' ELSE NULL END;
  IF v IS NOT NULL AND public.lifecycle_rank(v) > public.lifecycle_rank(NEW.lifecycle_stage) THEN NEW.lifecycle_stage := v; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lead_lifecycle_sync BEFORE INSERT OR UPDATE OF lead_stage ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_lifecycle_sync();

-- Backfill listing stages from history
UPDATE public.listings l SET lifecycle_stage = x.stage FROM (
  SELECT l2.id, CASE
    WHEN EXISTS(SELECT 1 FROM public.leads d WHERE d.linked_listing_id=l2.id AND d.lead_stage='closed') THEN 'closed'
    WHEN EXISTS(SELECT 1 FROM public.leads d WHERE d.linked_listing_id=l2.id AND d.lead_stage='awaiting_signature') THEN 'contract'
    WHEN EXISTS(SELECT 1 FROM public.leads d WHERE d.linked_listing_id=l2.id AND d.lead_stage='negotiation') THEN 'negotiation'
    WHEN EXISTS(SELECT 1 FROM public.property_tours t WHERE t.listing_id=l2.id AND t.status='completed') THEN 'tour_completed'
    WHEN EXISTS(SELECT 1 FROM public.property_tours t WHERE t.listing_id=l2.id) THEN 'tour_scheduled'
    WHEN EXISTS(SELECT 1 FROM public.listing_lead_charges c WHERE c.listing_id=l2.id) OR EXISTS(SELECT 1 FROM public.public_listing_interest p WHERE p.listing_id=l2.id) THEN 'inquiry'
    WHEN EXISTS(SELECT 1 FROM public.affiliate_referrals r WHERE r.listing_id=l2.id) THEN 'distributed'
    ELSE 'uploaded' END stage
  FROM public.listings l2) x WHERE x.id = l.id;
UPDATE public.listings SET last_activity_at = coalesce(updated_at, created_at, now());

-- Advertiser confirms availability (owner/workspace/superadmin)
CREATE OR REPLACE FUNCTION public.confirm_listing_availability(_listing uuid, _available boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l public.listings;
BEGIN
  SELECT * INTO l FROM public.listings WHERE id = _listing;
  IF l.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (l.user_id = auth.uid() OR l.owner_id = auth.uid() OR public.can_access_workspace_owner(l.workspace_owner_id) OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _available THEN
    UPDATE public.listings SET availability_confirmed_at = now(), last_activity_at = now(), availability_check_count = 0, availability_check_sent_at = NULL,
      affiliate_enabled = CASE WHEN distribution_paused THEN true ELSE affiliate_enabled END,
      distribution_paused = false, distribution_paused_at = NULL WHERE id = _listing;
  ELSE
    UPDATE public.listings SET status = 'discarded', is_published = false, affiliate_enabled = false, availability_check_count = 0, availability_check_sent_at = NULL, last_activity_at = now() WHERE id = _listing;
  END IF;
  INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
  VALUES (CASE WHEN _available THEN 'availability_confirmed' ELSE 'availability_denied' END, auth.uid(), 'listings', _listing::text,
    jsonb_build_object('was_paused', l.distribution_paused, 'checks_sent', l.availability_check_count));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.confirm_listing_availability(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_listing_availability(uuid, boolean) TO authenticated;

-- Daily availability sweep: prompt after 7 idle days, re-prompt every 7 days, pause partner distribution after 3 unanswered prompts.
CREATE OR REPLACE FUNCTION public.run_availability_checks(_limit int DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_sent int := 0; v_paused int := 0; v_owner uuid; v_title text;
BEGIN
  FOR r IN SELECT * FROM public.listings
    WHERE coalesce(status,'live') NOT IN ('discarded','draft') AND (is_published OR affiliate_enabled) AND NOT distribution_paused
      AND lifecycle_stage <> 'closed'
      AND greatest(last_activity_at, coalesce(availability_confirmed_at,'epoch')) < now() - interval '7 days'
      AND (availability_check_sent_at IS NULL OR availability_check_sent_at < now() - interval '7 days')
    ORDER BY last_activity_at LIMIT _limit
  LOOP
    v_owner := coalesce(r.owner_id, r.user_id, r.workspace_owner_id);
    v_title := coalesce(nullif(r.property_title,''), concat_ws(' ', r.address, r.house_number, r.city));
    IF r.availability_check_count >= 3 THEN
      UPDATE public.listings SET distribution_paused = true, distribution_paused_at = now(), affiliate_enabled = false WHERE id = r.id;
      INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel)
      VALUES (v_owner, 'listing_distribution_paused', 'ההפצה לשותפים הושהתה', 'לא התקבל אישור זמינות עבור ' || v_title || '. אשרו שהנכס עדיין זמין כדי לחדש את ההפצה.', '/my-ads', 'in_app');
      INSERT INTO public.audit_logs(action, actor_id, target_table, target_id, details)
      VALUES ('distribution_auto_paused', NULL, 'listings', r.id::text, jsonb_build_object('checks_sent', r.availability_check_count));
      v_paused := v_paused + 1;
    ELSE
      UPDATE public.listings SET availability_check_sent_at = now(), availability_check_count = availability_check_count + 1 WHERE id = r.id;
      INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel)
      VALUES (v_owner, 'listing_availability_check', 'ריטה: הנכס עדיין זמין?', 'לא היה עדכון ב-7 הימים האחרונים עבור ' || v_title || '. אשרו זמינות כדי להמשיך בהפצה.', '/my-ads', 'in_app');
      v_sent := v_sent + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('prompted', v_sent, 'paused', v_paused);
END $$;
REVOKE ALL ON FUNCTION public.run_availability_checks(int) FROM PUBLIC, anon, authenticated;

-- Partners can't pick paused listings
CREATE OR REPLACE FUNCTION public.block_paused_distribution() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.listings WHERE id = NEW.listing_id AND distribution_paused) THEN
    RAISE EXCEPTION 'listing distribution is paused pending availability confirmation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_paused_distribution BEFORE INSERT ON public.affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.block_paused_distribution();