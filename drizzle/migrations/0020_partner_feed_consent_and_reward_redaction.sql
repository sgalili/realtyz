DO $$ DECLARE f record; definition text; viewer text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_affiliate_marketplace','get_affiliate_marketplace_v2','get_affiliate_marketplace_v3','get_affiliate_marketplace_map') LOOP
  definition:=pg_get_functiondef(f.oid);
  viewer:=CASE WHEN f.proname='get_affiliate_marketplace_map' THEN '_user_id' ELSE 'auth.uid()' END;
  definition:=replace(definition,'l.affiliate_reward_type,','CASE WHEN public.partner_can_view_closing('||viewer||') THEN l.affiliate_reward_type ELSE NULL END,');
  definition:=replace(definition,'l.affiliate_reward_amount,','CASE WHEN public.partner_can_view_closing('||viewer||') THEN l.affiliate_reward_amount ELSE NULL END,');
  definition:=replace(definition,'WHERE l.affiliate_enabled = true','WHERE l.affiliate_enabled = true AND NOT l.distribution_paused AND EXISTS (SELECT 1 FROM public.profiles consent WHERE consent.id='||viewer||' AND consent.partner_terms_accepted_at IS NOT NULL)');
  EXECUTE definition;
 END LOOP;
END $$;