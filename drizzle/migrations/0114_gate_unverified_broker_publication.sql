CREATE OR REPLACE FUNCTION public.rz_gate_unverified_broker_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_published IS TRUE
     AND coalesce(NEW.features->>'publisher_type','') = 'broker'
     AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM TRUE)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.user_id = NEW.user_id
         AND r.role::text IN ('managing_broker','agent','lead_agent','junior_agent','super_admin')
     ) THEN
    RAISE EXCEPTION 'יש להשלים אימות רישיון תיווך לפני פרסום המודעה';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rz_gate_unverified_broker_publish ON public.listings;
CREATE TRIGGER trg_rz_gate_unverified_broker_publish BEFORE INSERT OR UPDATE OF is_published ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.rz_gate_unverified_broker_publish();