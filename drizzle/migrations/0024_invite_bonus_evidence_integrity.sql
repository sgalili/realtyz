CREATE OR REPLACE FUNCTION public.validate_invite_deal_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='approved' THEN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'verified_deal_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.status='approved' THEN
  IF NEW.approved_at IS NULL THEN RAISE EXCEPTION 'approval_required'; END IF;
  IF NEW.source_type='submission' THEN
   IF NOT EXISTS(SELECT 1 FROM public.affiliate_lead_submissions s JOIN public.listings l ON l.id=s.listing_id AND l.workspace_owner_id=s.broker_id WHERE s.id=NEW.source_id AND s.broker_id=NEW.workspace_owner_id AND s.status='closed' AND s.settlement_status IN ('approved','paid') AND s.verified_at IS NOT NULL AND s.closed_at IS NOT NULL AND (NEW.user_id IN (s.affiliate_id,s.broker_id,l.user_id) OR EXISTS(SELECT 1 FROM public.leads ld JOIN auth.users au ON au.id=NEW.user_id AND au.phone_confirmed_at IS NOT NULL AND nullif(au.phone,'') IS NOT NULL AND regexp_replace(au.phone,'[^0-9]','','g')=regexp_replace(ld.phone_number,'[^0-9]','','g') WHERE ld.id=s.lead_id AND ld.workspace_owner_id=s.broker_id AND NOT ld.is_demo))) THEN RAISE EXCEPTION 'approved_deal_evidence_required'; END IF;
  ELSIF NEW.source_type='document' THEN
   -- Brokerage/viewing form signatures alone never represent a completed deal.
   IF NOT EXISTS(SELECT 1 FROM public.closing_documents c JOIN public.listings l ON l.id=c.listing_id AND l.workspace_owner_id=c.workspace_owner_id JOIN public.leads ld ON ld.id=c.lead_id AND ld.workspace_owner_id=c.workspace_owner_id AND NOT ld.is_demo WHERE c.id=NEW.source_id AND c.workspace_owner_id=NEW.workspace_owner_id AND c.status='signed' AND c.signed_at IS NOT NULL AND nullif(c.signed_pdf_path,'') IS NOT NULL AND ld.lifecycle_stage='closed' AND (NEW.user_id=l.user_id OR EXISTS(SELECT 1 FROM auth.users au WHERE au.id=NEW.user_id AND au.phone_confirmed_at IS NOT NULL AND nullif(au.phone,'') IS NOT NULL AND regexp_replace(au.phone,'[^0-9]','','g')=regexp_replace(ld.phone_number,'[^0-9]','','g')))) THEN RAISE EXCEPTION 'completed_signed_deal_required'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_invite_deal_evidence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invite_deal_evidence BEFORE INSERT OR UPDATE ON public.invite_verified_deals FOR EACH ROW EXECUTE FUNCTION public.validate_invite_deal_evidence();
CREATE OR REPLACE FUNCTION public.invite_reward_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'invite_reward_immutable'; END $$;
REVOKE ALL ON FUNCTION public.invite_reward_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invite_reward_immutable BEFORE UPDATE OR DELETE ON public.invite_dual_rewards FOR EACH ROW EXECUTE FUNCTION public.invite_reward_immutable();