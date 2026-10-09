CREATE OR REPLACE FUNCTION public.audit_logs_system_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.actor_id IS NULL THEN
    NEW.actor_id := '00000000-0000-0000-0000-000000000000'::uuid;
    NEW.details := coalesce(NEW.details, '{}'::jsonb) || jsonb_build_object('actor', 'system');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_logs_system_actor BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_logs_system_actor();