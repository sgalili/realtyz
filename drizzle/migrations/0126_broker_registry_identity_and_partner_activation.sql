ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locked_broker_city text;
COMMENT ON COLUMN public.profiles.locked_broker_city IS 'Official registry city snapshot, writable only by service verification and immutable to client edits';
CREATE OR REPLACE FUNCTION public.protect_locked_broker_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.locked_broker_name IS NOT NULL THEN
  NEW.locked_broker_name:=OLD.locked_broker_name; NEW.full_name:=OLD.locked_broker_name;
 ELSIF NEW.locked_broker_name IS NOT NULL THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (NOT public.publisher_sms_verified() OR NEW.id IS DISTINCT FROM auth.uid() OR NOT public.partner_can_view_closing(NEW.id) OR NEW.locked_broker_name IS DISTINCT FROM public.official_broker_name(NEW.id,NEW.broker_license_number)) THEN RAISE EXCEPTION 'server_identity_required'; END IF;
  NEW.full_name:=NEW.locked_broker_name;
 END IF;
 IF TG_OP='UPDATE' AND OLD.locked_broker_city IS NOT NULL THEN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN NEW.locked_broker_city:=OLD.locked_broker_city; END IF;
 ELSIF NEW.locked_broker_city IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server_identity_required'; END IF;
 IF NEW.locked_broker_city IS NOT NULL THEN NEW.city:=NEW.locked_broker_city;
 ELSIF TG_OP='UPDATE' AND OLD.locked_broker_name IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN NEW.city:=OLD.city;
 END IF;
 RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.ensure_profile_row(_uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _email text; _phone text; _name text; BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'profile_user_id_required'; END IF;
 -- Existing identities need no UPDATE; partner registration must not retrigger expired license checks.
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid) THEN RETURN; END IF;
 SELECT u.email,COALESCE(u.phone,u.raw_user_meta_data->>'phone'),NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','')),'') INTO _email,_phone,_name FROM auth.users u WHERE u.id=_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'authenticated_user_not_found'; END IF;
 INSERT INTO public.profiles(id,email,phone,full_name) VALUES(_uid,NULLIF(_email,''),NULLIF(_phone,''),_name) ON CONFLICT(id) DO NOTHING;
 END $$;
REVOKE ALL ON FUNCTION public.ensure_profile_row(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile_row(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.activate_partner_mode() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _uid uuid:=auth.uid(); BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid AND partner_terms_accepted_at IS NOT NULL AND partner_terms_version='affiliate-marketing-2026-09') THEN RAISE EXCEPTION 'partner_terms_required'; END IF;
 RETURN public.register_as_affiliate(NULL,NULL);
 END $$;
REVOKE ALL ON FUNCTION public.activate_partner_mode() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_partner_mode() TO authenticated,service_role;