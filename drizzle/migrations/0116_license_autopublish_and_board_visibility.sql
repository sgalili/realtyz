CREATE OR REPLACE FUNCTION public.review_broker_upgrade_request(_id uuid, _approve boolean, _note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _admin uuid := auth.uid(); _r public.broker_upgrade_requests; _l record; _published int := 0;
BEGIN
  IF _admin IS NULL OR NOT public.has_role(_admin, 'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _r FROM public.broker_upgrade_requests WHERE id = _id FOR UPDATE;
  IF _r.id IS NULL OR _r.status <> 'pending' THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF _approve THEN
    -- Registry match, or a manual review backed by an uploaded license document.
    IF NOT public.official_license_exists(_r.license_number)
       AND NOT (_r.review_note = 'registry_unmatched_manual_review' AND _r.certificate_path IS NOT NULL) THEN
      RAISE EXCEPTION 'invalid_official_license';
    END IF;
    UPDATE public.profiles SET broker_license_number = _r.license_number WHERE id = _r.user_id;
    INSERT INTO public.user_roles(user_id, role) VALUES (_r.user_id, 'agent') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.broker_role_suspensions WHERE user_id = _r.user_id;
  END IF;
  UPDATE public.broker_upgrade_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reviewer_id = _admin, review_note = _note, reviewed_at = now() WHERE id = _id;
  IF _approve THEN
    FOR _l IN SELECT id FROM public.listings
      WHERE user_id = _r.user_id AND is_published = false AND status = 'pending'
        AND COALESCE(features->>'awaiting_license_approval','') = 'true'
    LOOP
      BEGIN
        UPDATE public.listings SET status = 'live', is_published = true, affiliate_enabled = true,
          features = features - 'awaiting_license_approval' WHERE id = _l.id;
        _published := _published + 1;
      EXCEPTION WHEN others THEN
        UPDATE public.listings SET source_metadata = COALESCE(source_metadata,'{}'::jsonb) || jsonb_build_object('publication_error', left(SQLERRM, 300)) WHERE id = _l.id;
      END;
    END LOOP;
  END IF;
  INSERT INTO public.audit_logs(actor_id, action, target_table, target_id, details)
    VALUES (_admin, CASE WHEN _approve THEN 'broker_upgrade_approved' ELSE 'broker_upgrade_rejected' END, 'broker_upgrade_requests', _id::text,
      jsonb_build_object('user_id', _r.user_id, 'license_number', _r.license_number, 'note', _note, 'auto_published', _published));
  PERFORM public.notify_broker_upgrade(_r.user_id, _id, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END);
  RETURN jsonb_build_object('ok', true, 'published', _published);
END $function$;

CREATE OR REPLACE FUNCTION public.set_my_ads_board_visibility(_ids uuid[], _visible boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _visible THEN
    UPDATE public.listings SET is_published = true, features = features - 'hidden_by_owner'
    WHERE id = ANY(_ids) AND public.ws_current_access(workspace_owner_id) AND status = 'live'
      AND is_published = false AND COALESCE(features->>'hidden_by_owner','') = 'true';
  ELSE
    UPDATE public.listings SET is_published = false, features = COALESCE(features,'{}'::jsonb) || '{"hidden_by_owner": true}'::jsonb
    WHERE id = ANY(_ids) AND public.ws_current_access(workspace_owner_id) AND status = 'live' AND is_published = true;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.set_my_ads_board_visibility(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_ads_board_visibility(uuid[], boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_ads_stats();
CREATE FUNCTION public.get_my_ads_stats()
 RETURNS TABLE(listing_id uuid, relation text, title text, city text, address text, deal_type text, asking_price numeric, slug text, image_url text, views bigint, clicks bigint, affiliates bigint, is_hidden boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 WITH mine AS (
   SELECT l.id,'owned'::text AS rel FROM public.listings l
   WHERE auth.uid() IS NOT NULL AND public.ws_current_access(l.workspace_owner_id) AND l.status<>'discarded'
     AND (l.is_published OR (l.status='live' AND COALESCE(l.features->>'hidden_by_owner','')='true'))
   UNION
   SELECT r.listing_id,'promoting' FROM public.affiliate_referrals r
   JOIN public.listings l ON l.id=r.listing_id
   WHERE auth.uid() IS NOT NULL AND r.affiliate_id=auth.uid() AND l.is_published AND l.affiliate_enabled AND l.status<>'discarded' AND NOT public.ws_current_access(l.workspace_owner_id)
 )
 SELECT l.id,m.rel,l.property_title,l.city,l.address,l.deal_type,l.asking_price,l.slug,coalesce(l.image_url,l.media_photos->>0),
 CASE WHEN m.rel='owned' THEN l.public_views::bigint+coalesce((SELECT sum(s.views_count) FROM public.property_shares s WHERE s.listing_id=l.id),0)::bigint ELSE coalesce((SELECT sum(e.amount) FROM public.listing_stat_events e WHERE e.listing_id=l.id AND e.affiliate_id=auth.uid() AND e.event_type='view'),0)::bigint END,
 coalesce((SELECT sum(r.clicks) FROM public.affiliate_referrals r WHERE r.listing_id=l.id AND (m.rel='owned' OR r.affiliate_id=auth.uid())),0)::bigint,
 (SELECT count(DISTINCT r.affiliate_id) FROM public.affiliate_referrals r WHERE r.listing_id=l.id)::bigint,
 (NOT l.is_published)
 FROM mine m JOIN public.listings l ON l.id=m.id;
$function$;
REVOKE ALL ON FUNCTION public.get_my_ads_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ads_stats() TO authenticated;