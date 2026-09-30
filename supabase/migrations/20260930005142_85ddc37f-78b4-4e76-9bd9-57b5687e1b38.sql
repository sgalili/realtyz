CREATE OR REPLACE FUNCTION public.set_workspace_email_provider(p_provider text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid := public.current_workspace_owner();
BEGIN
  IF auth.uid() IS NULL OR v_owner IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_provider NOT IN ('gmail','realtyz') THEN RAISE EXCEPTION 'invalid_provider'; END IF;
  UPDATE public.profiles SET email_provider = p_provider WHERE id = v_owner;
  RETURN p_provider;
END $function$;