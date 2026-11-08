CREATE OR REPLACE FUNCTION public.protect_locked_broker_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _official_name text; _has_evidence boolean:=false; BEGIN
 IF TG_OP='UPDATE' THEN
  SELECT registry_holder_name INTO _official_name FROM public.broker_license_verifications WHERE user_id=OLD.id AND license_number=OLD.broker_license_number;
  _has_evidence:=FOUND;
 END IF;
 IF TG_OP='UPDATE' AND OLD.locked_broker_name IS NOT NULL THEN
  NEW.locked_broker_name:=OLD.locked_broker_name; NEW.full_name:=OLD.locked_broker_name;
 ELSIF NEW.locked_broker_name IS NOT NULL THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (NOT public.publisher_sms_verified() OR NEW.id IS DISTINCT FROM auth.uid() OR NOT public.partner_can_view_closing(NEW.id) OR NEW.locked_broker_name IS DISTINCT FROM public.official_broker_name(NEW.id,NEW.broker_license_number)) THEN RAISE EXCEPTION 'server_identity_required'; END IF;
  NEW.full_name:=NEW.locked_broker_name;
 ELSIF _has_evidence AND auth.role() IS DISTINCT FROM 'service_role' THEN NEW.full_name:=COALESCE(_official_name,OLD.full_name);
 END IF;
 IF TG_OP='UPDATE' AND OLD.locked_broker_city IS NOT NULL THEN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN NEW.locked_broker_city:=OLD.locked_broker_city; END IF;
 ELSIF NEW.locked_broker_city IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'server_identity_required'; END IF;
 IF NEW.locked_broker_city IS NOT NULL THEN NEW.city:=NULLIF(NEW.locked_broker_city,'');
 ELSIF TG_OP='UPDATE' AND (OLD.locked_broker_name IS NOT NULL OR _has_evidence) AND auth.role() IS DISTINCT FROM 'service_role' THEN NEW.city:=OLD.city;
 END IF;
 RETURN NEW; END $$;