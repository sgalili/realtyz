
-- 1. Reassign owned data from WA user to super-admin user
UPDATE public.campaign_logs    SET user_id = 'e2ce54f6-0d84-4a62-8e70-460ba27fddc9' WHERE user_id = '8748daa7-64f5-4d94-ad78-bb104fc4fa1f';
UPDATE public.onboarding_state SET user_id = 'e2ce54f6-0d84-4a62-8e70-460ba27fddc9' WHERE user_id = '8748daa7-64f5-4d94-ad78-bb104fc4fa1f'
  AND NOT EXISTS (SELECT 1 FROM public.onboarding_state WHERE user_id = 'e2ce54f6-0d84-4a62-8e70-460ba27fddc9');
DELETE FROM public.onboarding_state WHERE user_id = '8748daa7-64f5-4d94-ad78-bb104fc4fa1f';
DELETE FROM public.profiles        WHERE id      = '8748daa7-64f5-4d94-ad78-bb104fc4fa1f';

-- 2. Free the phone from the duplicate user, then attach it to the super-admin
UPDATE auth.users SET phone = NULL, phone_confirmed_at = NULL WHERE id = '8748daa7-64f5-4d94-ad78-bb104fc4fa1f';

UPDATE auth.users
SET phone = '972546811841',
    phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('phone_number', '972546811841', 'wa_login', true)
WHERE id = 'e2ce54f6-0d84-4a62-8e70-460ba27fddc9';

-- 3. Remove the now-empty duplicate auth user (cascades any leftover identities/sessions)
DELETE FROM auth.users WHERE id = '8748daa7-64f5-4d94-ad78-bb104fc4fa1f';
