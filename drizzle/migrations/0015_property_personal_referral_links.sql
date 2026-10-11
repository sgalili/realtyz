CREATE OR REPLACE FUNCTION public.get_property_referral_link(_listing_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.listings; r public.affiliate_referrals; code text; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF public.is_user_banned(uid) THEN RAISE EXCEPTION 'account suspended'; END IF;
 SELECT * INTO l FROM public.listings WHERE id=_listing_id AND is_published AND status='live';
 IF l.id IS NULL OR l.distribution_paused OR public.is_user_banned(l.user_id) THEN RAISE EXCEPTION 'property unavailable for sharing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||_listing_id::text,0));
 SELECT * INTO r FROM public.affiliate_referrals WHERE affiliate_id=uid AND listing_id=l.id ORDER BY created_at LIMIT 1;
 IF r.id IS NULL THEN
 code:=substr(replace(gen_random_uuid()::text,'-',''),1,16);
 INSERT INTO public.affiliate_referrals(affiliate_id,broker_id,listing_id,tracking_code,channel,status,reward_type,reward_amount,tier1_amount,tier2_amount,tier3_type,tier3_amount)
 VALUES(uid,l.user_id,l.id,code,'direct','promoting',coalesce(l.affiliate_reward_type,'fixed'),CASE WHEN l.affiliate_enabled THEN coalesce(l.affiliate_reward_amount,0) ELSE 0 END,CASE WHEN l.affiliate_enabled THEN coalesce(l.affiliate_tier1_amount,0) ELSE 0 END,CASE WHEN l.affiliate_enabled THEN coalesce(l.affiliate_tier2_amount,0) ELSE 0 END,coalesce(l.affiliate_tier3_type,'fixed'),CASE WHEN l.affiliate_enabled THEN coalesce(l.affiliate_tier3_amount,0) ELSE 0 END) RETURNING * INTO r;
 INSERT INTO public.audit_logs(action,actor_id,target_table,target_id,details) VALUES('property_referral_link_created',uid,'affiliate_referrals',r.id::text,jsonb_build_object('listing_id',l.id,'workspace_owner_id',l.workspace_owner_id));
 END IF;
 RETURN 'https://realtyz.co.il/p/'||coalesce(nullif(l.slug,''),l.id::text)||'?ref='||r.tracking_code;
END $$;
REVOKE ALL ON FUNCTION public.get_property_referral_link(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_property_referral_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_property_referral_inquiry(_listing_id uuid,_lead_id uuid,_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.listings; r public.affiliate_referrals; v_owner uuid;
BEGIN
 SELECT * INTO l FROM public.listings WHERE id=_listing_id;
 IF l.id IS NULL OR NOT l.is_published OR l.distribution_paused THEN RETURN NULL; END IF;
 v_owner:=coalesce(l.workspace_owner_id,l.user_id);
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=_lead_id AND workspace_owner_id=v_owner) THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.affiliate_referrals WHERE listing_id=l.id AND lower(tracking_code)=lower(_code) LIMIT 1;
 IF r.id IS NULL OR r.broker_id<>l.user_id OR r.affiliate_id=l.user_id OR public.is_user_banned(r.affiliate_id) THEN RETURN NULL; END IF;
 UPDATE public.affiliate_referrals SET lead_id=coalesce(lead_id,_lead_id),status=CASE WHEN status IN ('promoting','clicked') THEN 'lead_captured' ELSE status END,updated_at=now() WHERE id=r.id;
 IF NOT EXISTS(SELECT 1 FROM public.interaction_activity_log WHERE workspace_owner_id=v_owner AND action_type='property_referral_inquiry' AND metadata->>'referral_id'=r.id::text AND metadata->>'lead_id'=_lead_id::text) THEN
 INSERT INTO public.interaction_activity_log(user_id,workspace_owner_id,platform,action_type,actor_type,content,metadata)
 VALUES(v_owner,v_owner,'web','property_referral_inquiry','system','פנייה דרך קישור שותף',jsonb_build_object('listing_id',l.id,'lead_id',_lead_id,'affiliate_id',r.affiliate_id,'referral_id',r.id,'pending_screening',true));
 END IF;
 RETURN r.affiliate_id;
END $$;
REVOKE ALL ON FUNCTION public.record_property_referral_inquiry(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_property_referral_inquiry(uuid,uuid,text) TO service_role;