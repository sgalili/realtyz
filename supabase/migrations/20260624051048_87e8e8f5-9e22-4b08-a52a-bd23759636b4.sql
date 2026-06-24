
CREATE OR REPLACE FUNCTION public.trg_fetch_wa_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
DECLARE
  _url text;
  _service_key text;
BEGIN
  IF COALESCE(NEW.is_demo,false) THEN RETURN NEW; END IF;
  IF NEW.phone_number IS NULL OR length(trim(NEW.phone_number)) < 6 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.phone_number IS NOT DISTINCT FROM OLD.phone_number
     AND NEW.profile_picture_url IS NOT NULL
     AND length(trim(NEW.profile_picture_url)) > 0
  THEN RETURN NEW; END IF;

  BEGIN _url := current_setting('app.supabase_url', true); EXCEPTION WHEN others THEN _url := NULL; END;
  BEGIN _service_key := current_setting('app.service_role_key', true); EXCEPTION WHEN others THEN _service_key := NULL; END;
  IF _url IS NULL OR _service_key IS NULL THEN
    SELECT decrypted_secret INTO _url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  END IF;
  IF _url IS NULL OR _service_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := _url || '/functions/v1/fetch-wa-avatars',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || _service_key,
      'apikey', _service_key
    ),
    body := jsonb_build_object('lead_ids', jsonb_build_array(NEW.id), 'force', false)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fetch_wa_avatar_on_lead_insert ON public.leads;
CREATE TRIGGER fetch_wa_avatar_on_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_fetch_wa_avatar();

DROP TRIGGER IF EXISTS fetch_wa_avatar_on_lead_update ON public.leads;
CREATE TRIGGER fetch_wa_avatar_on_lead_update
AFTER UPDATE OF phone_number ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_fetch_wa_avatar();
