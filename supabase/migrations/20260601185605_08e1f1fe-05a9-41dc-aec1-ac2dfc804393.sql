-- Auto-grant super_admin to the designated WhatsApp owner account.
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_wa_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = '972522973500@whatsapp.realtyz.local' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_wa_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_wa_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_super_admin_to_wa_owner();

-- Backfill if the user already exists.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users
WHERE lower(email) = '972522973500@whatsapp.realtyz.local'
ON CONFLICT (user_id, role) DO NOTHING;
