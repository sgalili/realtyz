CREATE OR REPLACE FUNCTION public.enforce_official_profile_license() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NULLIF(NEW.broker_license_number,'') IS NOT NULL AND NOT public.official_license_exists(NEW.broker_license_number) THEN RAISE EXCEPTION 'מספר הרישיון אינו תקף או אינו מופיע בפנקס המתווכים המורשים'; END IF;
 ELSIF NEW.broker_license_number IS DISTINCT FROM OLD.broker_license_number THEN
  IF (NULLIF(NEW.broker_license_number,'') IS NOT NULL OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.id AND role IN ('agent','lead_agent','managing_broker','junior_agent'))) AND NOT public.official_license_exists(NEW.broker_license_number) THEN RAISE EXCEPTION 'מספר הרישיון אינו תקף או אינו מופיע בפנקס המתווכים המורשים'; END IF;
 END IF;
 -- License changes and role grants remain validated; unrelated consent/contact updates cannot revoke identity.
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.accept_affiliate_terms(_version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_uid uuid:=auth.uid(); v_registration jsonb; v_at timestamptz; v_version text; BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF _version IS DISTINCT FROM 'affiliate-marketing-2026-09' THEN RAISE EXCEPTION 'invalid_terms_version'; END IF;
 v_registration:=public.register_as_affiliate(NULL,NULL);
 IF NOT COALESCE((v_registration->>'ok')::boolean,false) THEN RAISE EXCEPTION 'registration_failed'; END IF;
 SELECT partner_terms_accepted_at,partner_terms_version INTO v_at,v_version FROM public.profiles WHERE id=v_uid FOR UPDATE;
 IF v_at IS NULL OR v_version IS DISTINCT FROM _version THEN
  v_at:=now();
  UPDATE public.profiles SET partner_terms_accepted_at=v_at,partner_terms_version=_version WHERE id=v_uid;
  INSERT INTO public.audit_logs(actor_id,action,target_table,target_id,details) VALUES(v_uid,'partner_terms_accepted','profiles',v_uid::text,jsonb_build_object('version',_version,'accepted_at',v_at));
 END IF;
 INSERT INTO public.affiliate_profiles(user_id,terms_version,terms_accepted_at) VALUES(v_uid,_version,v_at) ON CONFLICT(user_id) DO UPDATE SET terms_version=excluded.terms_version,terms_accepted_at=excluded.terms_accepted_at;
 RETURN jsonb_build_object('ok',true); END $$;
REVOKE ALL ON FUNCTION public.accept_affiliate_terms(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_affiliate_terms(text) TO authenticated,service_role;