-- 1) Backfill created_by on social_connections rows that pre-date created_by tracking.
--    All existing rows belong to the super-admin (sole tenant so far).
UPDATE public.social_connections
SET created_by = (
  SELECT user_id FROM public.user_roles
  WHERE role = 'super_admin'::app_role
  ORDER BY user_id
  LIMIT 1
)
WHERE created_by IS NULL;

-- 2) Default created_by to the inserter so new rows always carry ownership.
CREATE OR REPLACE FUNCTION public.set_social_connection_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_connections_set_owner ON public.social_connections;
CREATE TRIGGER trg_social_connections_set_owner
BEFORE INSERT ON public.social_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_social_connection_owner();