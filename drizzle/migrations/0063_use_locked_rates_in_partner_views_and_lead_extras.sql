DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='get_affiliate_referral_listings';
 definition:=replace(definition,'JOIN public.listings l ON l.id = r.listing_id','JOIN public.listings l ON l.id = r.listing_id LEFT JOIN public.listing_reward_snapshots snap ON snap.listing_id=l.id AND snap.affiliate_id=r.affiliate_id AND snap.workspace_owner_id=coalesce(l.workspace_owner_id,l.user_id)');
 definition:=replace(definition,'    l.asking_price,','    coalesce(snap.asking_price,l.asking_price),');
 definition:=replace(definition,'    l.affiliate_tier1_amount,','    coalesce(snap.tier1_amount,l.affiliate_tier1_amount),');
 definition:=replace(definition,'    l.affiliate_tier2_amount,','    coalesce(snap.tier2_amount,l.affiliate_tier2_amount),');
 definition:=replace(definition,'    l.affiliate_tier3_amount,','    coalesce(snap.tier3_amount,l.affiliate_tier3_amount),');
 definition:=replace(definition,'THEN l.affiliate_tier4_type ELSE NULL END','THEN coalesce(snap.terms->''deal_closing_commission''->>''type'',snap.tier4_type,l.affiliate_tier4_type) ELSE NULL END');
 definition:=replace(definition,'THEN l.affiliate_tier4_amount ELSE NULL END','THEN coalesce(nullif(snap.terms->''deal_closing_commission''->>''value'','''')::numeric,snap.tier4_amount,l.affiliate_tier4_amount) ELSE NULL END');
 EXECUTE definition;
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='charge_lead_commission';
 definition:=replace(definition,'WHERE listing_id=l.id AND affiliate_id=_affiliate_id; END IF;','WHERE listing_id=l.id AND affiliate_id=_affiliate_id AND workspace_owner_id=v_owner; IF snap.id IS NULL THEN RETURN jsonb_build_object(''ok'',false,''error'',''locked_reward_terms_unavailable''); END IF; END IF;');
 definition:=replace(definition,'v_extra:=greatest(jsonb_array_length(v_questions)-3,0);','v_extra:=greatest(jsonb_array_length(CASE WHEN snap.id IS NOT NULL THEN coalesce(CASE _tier WHEN 2 THEN snap.terms->''questions'' ELSE coalesce(snap.terms->''questions_phone'',snap.terms->''questions'') END,''[]''::jsonb) ELSE v_questions END)-3,0);');
 definition:=replace(definition,'IF _tier=1 AND jsonb_typeof(l.contact_options->''form_fields'')=''array'' THEN v_extra:=least(jsonb_array_length(l.contact_options->''form_fields''),20); END IF;','IF _tier=1 THEN IF snap.id IS NOT NULL AND jsonb_typeof(snap.terms->''form_fields'')=''array'' THEN v_extra:=least(jsonb_array_length(snap.terms->''form_fields''),20); ELSIF snap.id IS NULL AND jsonb_typeof(l.contact_options->''form_fields'')=''array'' THEN v_extra:=least(jsonb_array_length(l.contact_options->''form_fields''),20); END IF; END IF;');
 EXECUTE definition;
END $$;