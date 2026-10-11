CREATE OR REPLACE FUNCTION public.get_transparency_summary()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ws uuid := public.current_workspace_owner(); v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN jsonb_build_object(
    'advertiser', jsonb_build_object(
      'active_listings', (SELECT count(*) FROM public.listings WHERE workspace_owner_id=v_ws AND is_published AND affiliate_enabled AND NOT coalesce(distribution_paused,false) AND coalesce(status,'live')<>'discarded'),
      'paused_listings', (SELECT count(*) FROM public.listings WHERE workspace_owner_id=v_ws AND distribution_paused),
      'leads_30d', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND created_at > now()-interval '30 days'),
      'approved', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND coalesce(dispute_status,'') NOT IN ('open','upheld')),
      'disputed', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND dispute_status='open'),
      'rejected', (SELECT count(*) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND dispute_status='upheld'),
      'spent', (SELECT coalesce(sum(gross),0) FROM public.listing_lead_charges WHERE workspace_owner_id=v_ws AND NOT is_leftover AND coalesce(dispute_status,'')<>'upheld')),
    'partner', jsonb_build_object(
      'promoted_listings', (SELECT count(DISTINCT listing_id) FROM public.affiliate_referrals WHERE affiliate_id=v_me),
      'leads_30d', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND created_at > now()-interval '30 days'),
      'approved', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND coalesce(dispute_status,'') NOT IN ('open','upheld')),
      'disputed', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND dispute_status='open'),
      'rejected', (SELECT count(*) FROM public.listing_lead_charges WHERE affiliate_id=v_me AND dispute_status='upheld')),
    'wallet', (SELECT jsonb_build_object('balance', coalesce(balance_ils,0), 'frozen', frozen) FROM public.credit_wallets WHERE user_id=v_me),
    'pending_disputes_value', (SELECT coalesce(sum(c.gross),0) FROM public.lead_disputes d JOIN public.listing_lead_charges c ON c.id=d.charge_id WHERE (d.affiliate_id=v_me OR d.workspace_owner_id=v_ws) AND d.status IN ('received','initial_review','appealed')),
    'banned', public.is_user_banned(v_me),
    'trust_score', (SELECT score FROM public.trust_scores WHERE user_id=v_me)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_transparency_shared_listing_ids()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id FROM public.listings WHERE auth.uid() IS NOT NULL AND workspace_owner_id=public.current_workspace_owner()
    AND is_published AND affiliate_enabled AND NOT coalesce(distribution_paused,false) AND coalesce(status,'live')<>'discarded'
$$;

CREATE OR REPLACE FUNCTION public.get_transparency_charges(_side text, _filter text)
 RETURNS TABLE(id uuid, listing_id uuid, title text, created_at timestamptz, gross numeric, dispute_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.listing_id, coalesce(l.property_title, concat_ws(', ', l.address, l.city)), c.created_at, c.gross, c.dispute_status
  FROM public.listing_lead_charges c LEFT JOIN public.listings l ON l.id=c.listing_id
  WHERE auth.uid() IS NOT NULL
    AND CASE WHEN _side='partner' THEN c.affiliate_id=auth.uid() ELSE c.workspace_owner_id=public.current_workspace_owner() END
    AND CASE _filter
      WHEN 'leads_30d' THEN c.created_at > now()-interval '30 days'
      WHEN 'approved' THEN coalesce(c.dispute_status,'') NOT IN ('open','upheld')
      WHEN 'disputed' THEN c.dispute_status='open'
      WHEN 'rejected' THEN c.dispute_status='upheld'
      ELSE false END
  ORDER BY c.created_at DESC LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.get_transparency_shared_listing_ids() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_transparency_charges(text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_transparency_shared_listing_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transparency_charges(text,text) TO authenticated;