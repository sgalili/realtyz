CREATE OR REPLACE FUNCTION public.guard_active_workspace_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.active_workspace_owner_id IS NULL OR NEW.active_workspace_owner_id = NEW.id THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.active_workspace_owner_id IS NOT DISTINCT FROM OLD.active_workspace_owner_id THEN RETURN NEW; END IF;
  IF public.is_workspace_member(NEW.active_workspace_owner_id, NEW.id)
     OR public.has_role(NEW.id, 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'workspace access denied' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS zz_guard_active_workspace_switch ON public.profiles;
CREATE TRIGGER zz_guard_active_workspace_switch BEFORE INSERT OR UPDATE OF active_workspace_owner_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_active_workspace_switch();

CREATE OR REPLACE FUNCTION public.guard_user_subscription_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.plan_id := NULL; NEW.plan_name := NULL; NEW.is_launch_promo := false;
    NEW.current_period_start := now(); NEW.current_period_end := now() + interval '30 days';
  ELSE
    NEW.plan_id := OLD.plan_id; NEW.plan_name := OLD.plan_name; NEW.is_launch_promo := OLD.is_launch_promo;
    NEW.current_period_start := OLD.current_period_start; NEW.current_period_end := OLD.current_period_end;
    IF OLD.plan_id IS NOT NULL THEN NEW.status := OLD.status; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_user_subscription_billing ON public.user_subscriptions;
CREATE TRIGGER zz_guard_user_subscription_billing BEFORE INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.guard_user_subscription_billing();

CREATE OR REPLACE FUNCTION public.guard_affiliate_plan_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _price numeric;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.plan_slug IS NOT DISTINCT FROM OLD.plan_slug THEN RETURN NEW; END IF;
  SELECT monthly_price_ils INTO _price FROM public.affiliate_plans WHERE slug = NEW.plan_slug;
  IF coalesce(_price, 1) > 0 THEN
    RAISE EXCEPTION 'paid affiliate plans require payment' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_affiliate_plan_slug ON public.affiliate_profiles;
CREATE TRIGGER zz_guard_affiliate_plan_slug BEFORE INSERT OR UPDATE OF plan_slug ON public.affiliate_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_affiliate_plan_slug();

CREATE OR REPLACE FUNCTION public.guard_submission_payout_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN RETURN NEW; END IF;
  NEW.affiliate_id := OLD.affiliate_id; NEW.broker_id := OLD.broker_id; NEW.listing_id := OLD.listing_id;
  IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'closed')
     OR NEW.settlement_status IS DISTINCT FROM OLD.settlement_status THEN
    IF auth.uid() <> OLD.broker_id OR auth.uid() = OLD.affiliate_id THEN
      RAISE EXCEPTION 'only the workspace owner can close or settle submissions' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.earned_amount := CASE WHEN NEW.status = 'rejected' THEN 0 ELSE
    coalesce(NEW.tier1_amount,0)
    + CASE WHEN NEW.status IN ('verified','closed') THEN coalesce(NEW.tier2_amount,0) ELSE 0 END
    + CASE WHEN NEW.status = 'closed' AND NEW.tier3_type = 'fixed' THEN coalesce(NEW.tier3_amount,0) ELSE 0 END
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zzz_guard_submission_payout_fields ON public.affiliate_lead_submissions;
CREATE TRIGGER zzz_guard_submission_payout_fields BEFORE UPDATE ON public.affiliate_lead_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_submission_payout_fields();

CREATE OR REPLACE FUNCTION public.select_my_affiliate_plan(_plan_slug text, _billing_period text DEFAULT 'monthly'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _plan public.affiliate_plans;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'affiliate') THEN
    RAISE EXCEPTION 'affiliate account required';
  END IF;
  SELECT * INTO _plan FROM public.affiliate_plans WHERE slug = _plan_slug AND is_active = true;
  IF _plan.id IS NULL THEN RAISE EXCEPTION 'unknown affiliate plan'; END IF;
  IF _billing_period NOT IN ('monthly','annual') THEN RAISE EXCEPTION 'invalid billing period'; END IF;
  IF coalesce(_plan.monthly_price_ils,0) > 0 AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'paid affiliate plans require payment';
  END IF;
  INSERT INTO public.affiliate_profiles (user_id, plan_slug, billing_period)
  VALUES (auth.uid(), _plan.slug, _billing_period)
  ON CONFLICT (user_id) DO UPDATE SET plan_slug = EXCLUDED.plan_slug, billing_period = EXCLUDED.billing_period, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'plan_slug', _plan.slug, 'billing_period', _billing_period, 'contact_limit', _plan.contact_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bulk_update_leads(lead_ids uuid[], new_status text DEFAULT NULL::text, new_interest_tag text DEFAULT NULL::text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF array_length(lead_ids, 1) IS NULL OR array_length(lead_ids, 1) = 0 THEN
    RAISE EXCEPTION 'lead_ids array cannot be empty';
  END IF;
  IF array_length(lead_ids, 1) > 10000 THEN
    RAISE EXCEPTION 'Cannot update more than 10,000 leads at once';
  END IF;
  IF new_status IS NULL AND new_interest_tag IS NULL THEN
    RAISE EXCEPTION 'At least one field must be provided for update';
  END IF;
  UPDATE public.leads
  SET status = COALESCE(new_status, status),
      interest_tag = COALESCE(new_interest_tag, interest_tag),
      last_interaction_at = now()
  WHERE id = ANY(lead_ids)
    AND public.can_access_workspace_owner(workspace_owner_id);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_autopilot_jobs(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_autopilot_jobs(integer, text) TO service_role;