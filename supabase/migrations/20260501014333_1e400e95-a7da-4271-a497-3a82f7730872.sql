CREATE OR REPLACE FUNCTION public.enforce_close_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(NEW.lead_stage,'')) IN ('closed','won','converted','lost')
     AND lower(coalesce(OLD.lead_stage,'')) NOT IN ('closed','won','converted','lost') THEN
    IF auth.uid() IS NOT NULL AND NOT public.can_close_deal(auth.uid()) THEN
      RAISE EXCEPTION 'Only Agents can close deals. Ask an Agent to approve this transition.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_close_permission ON public.leads;
CREATE TRIGGER trg_enforce_close_permission
  BEFORE UPDATE OF lead_stage ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_close_permission();