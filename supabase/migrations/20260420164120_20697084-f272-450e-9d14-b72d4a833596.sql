
-- Create triggers on auth.users for auto-profile + auto-super-admin grant
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_grant_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_super_admin_to_owner();

-- Backfill profiles for any users that exist already
INSERT INTO public.profiles (id, email, full_name, last_sign_in_at)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
       u.last_sign_in_at
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Ensure sgalili@gmail.com gets super_admin if their account already exists
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::app_role
FROM auth.users u
WHERE u.email = 'sgalili@gmail.com'
ON CONFLICT DO NOTHING;
