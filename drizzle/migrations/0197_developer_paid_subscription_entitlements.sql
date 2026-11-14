ALTER TABLE public.grow_payment_orders
  ADD COLUMN plan_code text,
  ADD COLUMN base_amount_ils numeric,
  ADD COLUMN vat_amount_ils numeric,
  ADD COLUMN terms_accepted_at timestamptz;

ALTER TABLE public.grow_subscription_entitlements
  ADD COLUMN plan_code text,
  ADD COLUMN workspace_owner_id uuid;

ALTER TABLE public.grow_payment_orders DROP CONSTRAINT grow_payment_orders_purpose_check;
ALTER TABLE public.grow_payment_orders DROP CONSTRAINT grow_order_amount_by_purpose;
ALTER TABLE public.grow_payment_orders
  ADD CONSTRAINT grow_payment_orders_purpose_check CHECK (purpose IN ('subscription','wallet_topup','developer_subscription')),
  ADD CONSTRAINT grow_order_amount_by_purpose CHECK (
    (purpose='subscription' AND amount_ils=6500 AND plan_code IS NULL)
    OR (purpose='wallet_topup' AND amount_ils>0 AND amount_ils<=10000 AND amount_ils=round(amount_ils,2) AND workspace_owner_id IS NOT NULL AND plan_code IS NULL)
    OR (purpose='developer_subscription' AND plan_code='developer_monthly' AND base_amount_ils=9500 AND vat_amount_ils=1710 AND amount_ils=11210 AND duration_days=30 AND workspace_owner_id IS NOT NULL AND terms_accepted_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.complete_grow_payment(_order_id uuid,_transaction_id text,_amount_ils numeric,_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.grow_payment_orders;
BEGIN
 SELECT * INTO o FROM public.grow_payment_orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
 IF o.amount_ils<>_amount_ils OR o.environment<>_environment OR nullif(_transaction_id,'') IS NULL THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
 IF o.status='paid' THEN
  IF o.transaction_id<>_transaction_id THEN RAISE EXCEPTION 'transaction_mismatch'; END IF;
  RETURN jsonb_build_object('ok',true,'duplicate',true);
 END IF;
 IF o.status NOT IN ('pending','link_ready') THEN RAISE EXCEPTION 'order_not_payable'; END IF;
 UPDATE public.grow_payment_orders SET status='paid',transaction_id=_transaction_id,paid_at=now() WHERE id=o.id;
 IF o.environment='live' THEN
  IF o.purpose='wallet_topup' THEN
   PERFORM public.add_credit(o.workspace_owner_id,o.amount_ils+o.wallet_bonus_ils,'topup',o.id,'Grow wallet deposit; bonus '||o.wallet_bonus_percent||'%');
  ELSE
   INSERT INTO public.grow_subscription_entitlements(order_id,user_id,title,benefits,starts_at,expires_at,plan_code,workspace_owner_id)
   VALUES(o.id,o.user_id,o.title,o.benefits,now(),now()+make_interval(days=>o.duration_days),o.plan_code,o.workspace_owner_id);
   IF o.purpose='developer_subscription' THEN
    PERFORM public.ensure_profile_row(o.user_id);
    INSERT INTO public.user_roles(user_id,role) VALUES (o.user_id,'developer') ON CONFLICT(user_id,role) DO NOTHING;
    UPDATE public.workspace_memberships SET account_type='developer' WHERE user_id=o.user_id AND workspace_owner_id=o.user_id;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'test',o.environment='sandbox');
END $$;
REVOKE ALL ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_grow_payment(uuid,text,numeric,text) TO service_role;

CREATE FUNCTION public.protect_developer_subscription_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.purpose='developer_subscription' AND ROW(NEW.plan_code,NEW.base_amount_ils,NEW.vat_amount_ils,NEW.amount_ils,NEW.duration_days,NEW.workspace_owner_id,NEW.terms_accepted_at) IS DISTINCT FROM ROW(OLD.plan_code,OLD.base_amount_ils,OLD.vat_amount_ils,OLD.amount_ils,OLD.duration_days,OLD.workspace_owner_id,OLD.terms_accepted_at) THEN
  RAISE EXCEPTION 'developer_subscription_snapshot_immutable';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_developer_subscription_order() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_developer_subscription_order BEFORE UPDATE ON public.grow_payment_orders FOR EACH ROW EXECUTE FUNCTION public.protect_developer_subscription_order();

CREATE FUNCTION public.developer_subscription_active(_workspace uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
  WHEN auth.uid() IS NULL OR _workspace IS NULL OR NOT public.ws_current_access(_workspace) THEN false
  WHEN public.has_role(auth.uid(),'super_admin') THEN true
  ELSE EXISTS(
   SELECT 1 FROM public.grow_subscription_entitlements e
   WHERE e.workspace_owner_id=_workspace AND e.plan_code='developer_monthly' AND e.starts_at<=now() AND e.expires_at>now()
  )
 END
$$;
REVOKE ALL ON FUNCTION public.developer_subscription_active(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.developer_subscription_active(uuid) TO authenticated,service_role;

CREATE FUNCTION public.get_developer_subscription_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ws uuid:=public.current_workspace_owner(); expiry timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
 IF ws IS NULL OR NOT public.ws_current_access(ws) THEN RAISE EXCEPTION 'workspace_access_denied'; END IF;
 SELECT max(e.expires_at) INTO expiry FROM public.grow_subscription_entitlements e
 WHERE e.workspace_owner_id=ws AND e.plan_code='developer_monthly' AND e.starts_at<=now() AND e.expires_at>now();
 RETURN jsonb_build_object('active',public.developer_subscription_active(ws),'expires_at',expiry,'plan_code','developer_monthly','workspace_owner_id',ws);
END $$;
REVOKE ALL ON FUNCTION public.get_developer_subscription_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_developer_subscription_status() TO authenticated;

DROP POLICY "ws access developer_projects" ON public.developer_projects;
CREATE POLICY "ws access developer_projects" ON public.developer_projects FOR ALL TO authenticated
 USING (public.ws_current_access(workspace_owner_id) AND public.developer_subscription_active(workspace_owner_id))
 WITH CHECK (public.ws_current_access(workspace_owner_id) AND public.developer_subscription_active(workspace_owner_id));

DROP POLICY "Workspace members can insert developers" ON public.developers;
CREATE POLICY "Workspace members can insert developers" ON public.developers FOR INSERT TO authenticated
 WITH CHECK (public.ws_current_access(workspace_owner_id) AND public.developer_subscription_active(workspace_owner_id));
DROP POLICY "Workspace members can update developers" ON public.developers;
CREATE POLICY "Workspace members can update developers" ON public.developers FOR UPDATE TO authenticated
 USING (public.ws_current_access(workspace_owner_id) AND public.developer_subscription_active(workspace_owner_id))
 WITH CHECK (public.ws_current_access(workspace_owner_id) AND public.developer_subscription_active(workspace_owner_id));
DROP POLICY "Workspace members can delete developers" ON public.developers;
CREATE POLICY "Workspace members can delete developers" ON public.developers FOR DELETE TO authenticated
 USING (public.ws_current_access(workspace_owner_id) AND public.developer_subscription_active(workspace_owner_id));

CREATE OR REPLACE FUNCTION public.set_developer_company_commissions(_company uuid,_config jsonb,_apply_existing boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ws uuid:=public.current_workspace_owner(); n integer:=0; f jsonb:=_config->'defaults';
BEGIN
 IF auth.uid() IS NULL OR NOT public.ws_current_access(ws) OR NOT(public.has_role(ws,'developer') OR public.has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'company_access_denied'; END IF;
 IF NOT public.developer_subscription_active(ws) THEN RAISE EXCEPTION 'developer_subscription_required'; END IF;
 IF NOT public.developer_fees_valid(f,'sale',1) OR octet_length(_config::text)>40000 THEN RAISE EXCEPTION 'developer_commissions_required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(f->'caps') c WHERE c.value::numeric>100000) OR (f->>'form')::numeric>500 OR (f->>'whatsapp')::numeric>500 OR (f->>'phone')::numeric>500 THEN RAISE EXCEPTION 'invalid_commission_limits'; END IF;
 UPDATE public.developers SET commission_config=jsonb_build_object('defaults',f) WHERE id=_company AND workspace_owner_id=ws;
 IF NOT FOUND THEN RAISE EXCEPTION 'company_access_denied'; END IF;
 IF _apply_existing THEN
  UPDATE public.developer_projects SET commission_config=jsonb_set(commission_config,'{defaults}',f,true) WHERE developer_id=_company AND workspace_owner_id=ws;
  GET DIAGNOSTICS n=ROW_COUNT;
 END IF;
 RETURN jsonb_build_object('ok',true,'updated_projects',n);
END $$;

CREATE FUNCTION public.enforce_developer_listing_subscription() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.developer_project_id IS NOT NULL AND COALESCE(NEW.is_published,false) AND NOT public.developer_subscription_active(NEW.workspace_owner_id) THEN
  RAISE EXCEPTION 'developer_subscription_required';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_developer_listing_subscription() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_developer_listing_subscription BEFORE INSERT OR UPDATE OF is_published,developer_project_id ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_developer_listing_subscription();

COMMENT ON COLUMN public.grow_payment_orders.terms_accepted_at IS 'Server timestamp recorded only after the developer explicitly accepted the terms before hosted checkout.';
COMMENT ON COLUMN public.grow_subscription_entitlements.plan_code IS 'developer_monthly identifies the paid developer plan; legacy subscriptions retain NULL.';
COMMENT ON FUNCTION public.developer_subscription_active(uuid) IS 'Workspace-scoped live developer entitlement check; Super Admin access remains available and sandbox payments never qualify.';