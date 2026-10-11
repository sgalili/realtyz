CREATE OR REPLACE FUNCTION public.partner_can_view_closing(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _user_id IS NOT NULL AND NOT public.has_role(_user_id,'developer') AND public.affiliate_tier3_eligible(_user_id)
$$;
REVOKE ALL ON FUNCTION public.partner_can_view_closing(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_can_view_closing(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.protect_affiliate_license_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role()='service_role' OR public.has_role(auth.uid(),'super_admin') THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF coalesce(NEW.license_status,'none')='verified' OR NEW.license_verified_at IS NOT NULL THEN RAISE EXCEPTION 'verification requires administrator'; END IF;
 ELSE
  IF (NEW.license_status IS DISTINCT FROM OLD.license_status AND NEW.license_status IN ('verified','rejected')) OR NEW.license_verified_at IS DISTINCT FROM OLD.license_verified_at THEN RAISE EXCEPTION 'verification requires administrator'; END IF;
  IF OLD.license_status='verified' AND (NEW.license_number IS DISTINCT FROM OLD.license_number OR NEW.license_holder_name IS DISTINCT FROM OLD.license_holder_name) THEN NEW.license_status:='pending'; NEW.license_verified_at:=NULL; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_affiliate_license_verification BEFORE INSERT OR UPDATE ON public.affiliate_profiles FOR EACH ROW EXECUTE FUNCTION public.protect_affiliate_license_verification();

CREATE POLICY partner_referral_closing_isolation ON public.affiliate_referrals AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.partner_can_view_closing(auth.uid()) OR (broker_id<>affiliate_id AND public.can_access_workspace_owner(broker_id)) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY partner_submission_closing_isolation ON public.affiliate_lead_submissions AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.partner_can_view_closing(auth.uid()) OR (broker_id<>affiliate_id AND public.can_access_workspace_owner(broker_id)) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY partner_snapshot_closing_isolation ON public.listing_reward_snapshots AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.partner_can_view_closing(auth.uid()) OR (workspace_owner_id<>affiliate_id AND public.can_access_workspace_owner(workspace_owner_id)) OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.get_my_partner_referrals() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(CASE WHEN public.partner_can_view_closing(auth.uid()) THEN to_jsonb(r) ELSE
 (to_jsonb(r)-'notes'-'lead_id'-'reward_amount'-'reward_type'-'settled_at') || jsonb_build_object('reward_type','fixed','reward_amount',0,'settled_at',NULL,'status',CASE WHEN r.status='deal_signed' THEN 'qualified' ELSE r.status END) END ORDER BY r.created_at DESC),'[]'::jsonb)
 FROM public.affiliate_referrals r WHERE r.affiliate_id=auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.get_my_partner_submissions() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(CASE WHEN public.partner_can_view_closing(auth.uid()) THEN to_jsonb(s)-'realtyz_commission_rate'-'realtyz_commission_amount' ELSE
 (to_jsonb(s)-'notes'-'closed_at'-'tier4_type'-'tier4_amount'-'realtyz_commission_rate'-'realtyz_commission_amount'-'partner_net_amount'-'earned_amount') || jsonb_build_object('status',CASE WHEN s.status='closed' THEN 'verified' ELSE s.status END,'closed_at',NULL,'tier4_type',NULL,'tier4_amount',NULL,'earned_amount',CASE WHEN s.status='rejected' THEN 0 ELSE coalesce(s.tier1_amount,0)+CASE WHEN s.status IN ('verified','closed') THEN coalesce(s.tier2_amount,0) ELSE 0 END END) END ORDER BY s.created_at DESC),'[]'::jsonb)
 FROM public.affiliate_lead_submissions s WHERE s.affiliate_id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_partner_referrals(),public.get_my_partner_submissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_partner_referrals(),public.get_my_partner_submissions() TO authenticated,service_role;

-- Redact closing fields in all existing marketplace projections without changing their return contracts.
DO $$ DECLARE f record; d text; identity text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('get_affiliate_marketplace','get_affiliate_marketplace_v2','get_affiliate_marketplace_v3','get_affiliate_marketplace_map','get_affiliate_referral_listings') LOOP
  d:=pg_get_functiondef(f.oid);
  identity:=CASE WHEN f.proname='get_affiliate_marketplace_map' THEN '_user_id' ELSE 'auth.uid()' END;
  d:=replace(d,'l.affiliate_tier4_type,','CASE WHEN public.partner_can_view_closing('||identity||') THEN l.affiliate_tier4_type ELSE NULL END,');
  d:=replace(d,'l.affiliate_tier4_amount,','CASE WHEN public.partner_can_view_closing('||identity||') THEN l.affiliate_tier4_amount ELSE NULL END,');
  EXECUTE d;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_affiliate_contacts()
RETURNS TABLE(lead_id uuid,full_name text,phone_number text,email text,city text,neighborhood text,deal_type text,lead_stage text,status text,profile_picture_url text,last_interaction_at timestamptz,created_at timestamptz,submission_status text,earned_amount numeric,settlement_status text,listing_id uuid,message_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH accessible AS (SELECT DISTINCT x.lead_id FROM (SELECT a.lead_id FROM public.affiliate_conversation_access a WHERE a.affiliate_user_id=auth.uid() UNION SELECT s.lead_id FROM public.affiliate_lead_submissions s WHERE s.affiliate_id=auth.uid()) x WHERE x.lead_id IS NOT NULL)
 SELECT l.id,l.full_name,l.phone_number,l.email,l.city,l.neighborhood,l.deal_type,
 CASE WHEN public.partner_can_view_closing(auth.uid()) THEN l.lead_stage ELSE NULL END,
 CASE WHEN public.partner_can_view_closing(auth.uid()) THEN l.status ELSE NULL END,
 l.profile_picture_url,l.last_interaction_at,l.created_at,
 CASE WHEN NOT public.partner_can_view_closing(auth.uid()) AND sub.status='closed' THEN 'verified' ELSE sub.status END,
 CASE WHEN public.partner_can_view_closing(auth.uid()) THEN sub.earned_amount ELSE CASE WHEN sub.status='rejected' THEN 0 ELSE coalesce(sub.tier1_amount,0)+CASE WHEN sub.status IN ('verified','closed') THEN coalesce(sub.tier2_amount,0) ELSE 0 END END END,
 sub.settlement_status,sub.listing_id,coalesce(mc.cnt,0)
 FROM accessible acc JOIN public.leads l ON l.id=acc.lead_id
 LEFT JOIN LATERAL (SELECT s.* FROM public.affiliate_lead_submissions s WHERE s.lead_id=l.id AND s.affiliate_id=auth.uid() ORDER BY s.created_at DESC LIMIT 1) sub ON true
 LEFT JOIN LATERAL (SELECT count(*) cnt FROM public.messages m WHERE m.lead_id=l.id) mc ON true
 ORDER BY coalesce(l.last_interaction_at,l.created_at) DESC LIMIT 300
$$;