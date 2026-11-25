CREATE OR REPLACE FUNCTION public.enforce_official_broker_role()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
  IF NEW.role IN ('agent','lead_agent','managing_broker','junior_agent')
     AND NOT public.has_verified_broker_license(NEW.user_id)
     AND NOT (NEW.role = 'agent' AND EXISTS (SELECT 1 FROM public.broker_license_grace g WHERE g.user_id = NEW.user_id AND g.expires_at > now())) THEN
    RAISE EXCEPTION 'מספר הרישיון אינו תקף או אינו מופיע בפנקס המתווכים המורשים';
  END IF;
  RETURN NEW;
END $function$;