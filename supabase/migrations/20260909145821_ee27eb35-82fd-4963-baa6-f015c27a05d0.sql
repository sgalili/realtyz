CREATE OR REPLACE FUNCTION public.enforce_plan_contact_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Limits removed: this workspace is a dedicated broker-recruitment hub.
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_trial_lead_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Trial caps removed.
  RETURN NEW;
END; $function$;