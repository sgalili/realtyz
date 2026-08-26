DELETE FROM public.messenger_page_bindings
WHERE lower(btrim(coalesce(page_name, ''))) = 'employee'
   OR page_id = '122096304951460522';

DELETE FROM public.fb_personal_connections
WHERE lower(btrim(coalesce(fb_user_name, ''))) = 'employee';

DELETE FROM public.social_connections
WHERE platform IN ('facebook', 'facebook_page', 'instagram', 'meta')
  AND (
    lower(btrim(coalesce(display_name, ''))) = 'employee'
    OR lower(btrim(coalesce(credentials->>'page_name', ''))) = 'employee'
    OR lower(btrim(coalesce(credentials->>'name', ''))) = 'employee'
    OR coalesce(credentials->>'page_id', '') = '122096304951460522'
    OR coalesce(credentials->>'account_id', '') = '122096304951460522'
  );

CREATE OR REPLACE FUNCTION public.reject_invalid_facebook_page_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.page_id = '122096304951460522'
     OR lower(btrim(coalesce(NEW.page_name, ''))) = 'employee'
     OR lower(btrim(coalesce(NEW.page_name, ''))) = 'business asset'
  THEN
    RAISE EXCEPTION 'Invalid Facebook publishing identity: a Business Page is required'
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