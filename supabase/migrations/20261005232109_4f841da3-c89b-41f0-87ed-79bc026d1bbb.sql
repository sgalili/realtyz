DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.get_my_ad_details(uuid)'::regprocedure) INTO definition;
 definition := replace(definition, 'coalesce((SELECT sum(c.gross) FILTER(WHERE NOT c.is_leftover)+coalesce(sum(c.purchase_price) FILTER(WHERE c.purchased_at IS NOT NULL),0)', 'coalesce((SELECT coalesce(sum(c.gross) FILTER(WHERE NOT c.is_leftover),0)+coalesce(sum(c.purchase_price) FILTER(WHERE c.purchased_at IS NOT NULL),0)');
 definition := replace(definition, 'AS clicks,', 'AS clicks, coalesce((SELECT sum(e.amount) FROM public.listing_stat_events e WHERE e.listing_id=_listing_id AND e.affiliate_id=a.affiliate_id AND e.event_type=''view''),0) AS views,');
 EXECUTE definition;
END $$;