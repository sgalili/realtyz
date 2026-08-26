CREATE OR REPLACE FUNCTION public.reject_invalid_facebook_page_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.page_id IS NULL
     OR btrim(NEW.page_id) <> '61580625810292'
     OR NEW.page_access_token IS NULL
     OR length(btrim(NEW.page_access_token)) < 40
     OR lower(btrim(coalesce(NEW.page_name, ''))) ~ '(employee|business[[:space:]]*asset|עובד)'
  THEN
    RAISE EXCEPTION 'Invalid Facebook publishing identity: verified Business Page 61580625810292 is required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_invalid_facebook_page_binding_trigger
ON public.messenger_page_bindings;

CREATE TRIGGER reject_invalid_facebook_page_binding_trigger
BEFORE INSERT OR UPDATE ON public.messenger_page_bindings
FOR EACH ROW
EXECUTE FUNCTION public.reject_invalid_facebook_page_binding();