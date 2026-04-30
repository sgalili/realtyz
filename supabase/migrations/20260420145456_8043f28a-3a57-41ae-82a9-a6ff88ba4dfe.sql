-- Auto-promote sgalili@gmail.com to super_admin on signup, and now if already present
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users
WHERE email = 'sgalili@gmail.com'
ON CONFLICT DO NOTHING;

-- Backfill profile row in case the trigger missed it
INSERT INTO public.profiles (id, email, full_name, last_sign_in_at)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', ''), last_sign_in_at
FROM auth.users
WHERE email = 'sgalili@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Trigger function: ensure sgalili@gmail.com always gets super_admin on signup
CREATE OR REPLACE FUNCTION public.grant_super_admin_to_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'sgalili@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_super_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.grant_super_admin_to_owner();