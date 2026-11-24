CREATE TABLE public.broker_registry_no_matches (broker_id uuid NOT NULL REFERENCES public.profiles(id), license_number text NOT NULL CHECK(license_number ~ '^[1-9][0-9]{0,9}$'), checked_at timestamptz NOT NULL DEFAULT now(), checked_by uuid NOT NULL REFERENCES public.profiles(id), PRIMARY KEY(broker_id,license_number));
GRANT SELECT ON public.broker_registry_no_matches TO authenticated;
GRANT ALL ON public.broker_registry_no_matches TO service_role;
ALTER TABLE public.broker_registry_no_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY registry_no_match_admin_read ON public.broker_registry_no_matches FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin') AND NOT EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id=auth.uid()));
CREATE FUNCTION public.save_admin_registry_no_match(_actor uuid,_user uuid,_license text,_batch uuid DEFAULT NULL,_token uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; imported text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_actor,'super_admin') OR EXISTS(SELECT 1 FROM public.demo_view_accounts WHERE user_id IN(_actor,_user)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _batch IS NOT NULL THEN
 PERFORM 1 FROM public.broker_registry_batches WHERE id=_batch AND created_by=_actor AND status='running' AND lease_token=_token AND lease_until>now() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.broker_registry_batch_items WHERE batch_id=_batch AND broker_id=_user AND license_number=_license AND status='pending') THEN RAISE EXCEPTION 'cancelled_or_stale_batch' USING ERRCODE='40001'; END IF;
 END IF;
 SELECT * INTO p FROM public.profiles WHERE id=_user FOR UPDATE;
 SELECT imported_license_number INTO imported FROM public.admin_broker_onboarding WHERE user_id=_user;
 IF p.id IS NULL OR COALESCE(NULLIF(p.broker_license_number,''),imported) IS DISTINCT FROM _license OR NULLIF(p.locked_broker_name,'') IS NOT NULL OR EXISTS(SELECT 1 FROM public.broker_license_verifications WHERE user_id=_user AND verified_at IS NOT NULL) THEN RAISE EXCEPTION 'target_changed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.broker_registry_no_matches(broker_id,license_number,checked_by) VALUES(_user,_license,_actor) ON CONFLICT(broker_id,license_number) DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.save_admin_registry_no_match(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_registry_no_match(uuid,uuid,text,uuid,uuid) TO service_role;
CREATE FUNCTION public.exclude_checked_registry_no_match() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.broker_registry_no_matches WHERE broker_id=NEW.broker_id AND license_number=NEW.license_number) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.exclude_checked_registry_no_match() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_checked_registry_no_match() TO service_role;
CREATE TRIGGER exclude_registry_no_match BEFORE INSERT ON public.broker_registry_batch_items FOR EACH ROW EXECUTE FUNCTION public.exclude_checked_registry_no_match();