-- Backfill profiles for every existing auth user
INSERT INTO public.profiles (id, email, full_name, last_sign_in_at, created_at)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  u.last_sign_in_at,
  u.created_at
FROM auth.users u
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      last_sign_in_at = EXCLUDED.last_sign_in_at;

-- Make sure sgalili@gmail.com has super_admin if the account exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users
WHERE email = 'sgalili@gmail.com'
ON CONFLICT DO NOTHING;