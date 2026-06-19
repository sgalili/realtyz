
-- 1) Delete the synthetic WhatsApp-only account first so its phone is freed.
DELETE FROM public.workspace_memberships WHERE user_id = 'df398b78-d1fe-4525-957d-0ed437e91981';
DELETE FROM public.user_roles WHERE user_id = 'df398b78-d1fe-4525-957d-0ed437e91981';
DELETE FROM public.profiles WHERE id = 'df398b78-d1fe-4525-957d-0ed437e91981';
DELETE FROM auth.users WHERE id = 'df398b78-d1fe-4525-957d-0ed437e91981';

-- 2) Attach the phone to the real super-admin account so the OTP lookup matches it.
UPDATE auth.users
SET phone = '972546811841',
    phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('phone_number','972546811841')
WHERE id = 'f12db948-d4dd-4f53-878f-b9f2fb81c0fb';

-- 3) Make sure sgalili has a profile row, then add him as managing_broker member of Udi's workspace.
INSERT INTO public.profiles (id, email, full_name, workspace_owner_id)
VALUES ('f12db948-d4dd-4f53-878f-b9f2fb81c0fb','sgalili@gmail.com','Shay Galili','f12db948-d4dd-4f53-878f-b9f2fb81c0fb')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
VALUES ('f12db948-d4dd-4f53-878f-b9f2fb81c0fb','managing_broker')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.workspace_memberships (user_id, workspace_owner_id, role, workspace_name)
VALUES ('f12db948-d4dd-4f53-878f-b9f2fb81c0fb','8f66ac1a-070a-4485-ac3b-07697d6c4b9e','managing_broker','אודי ויטמן')
ON CONFLICT (user_id, workspace_owner_id) DO UPDATE
SET role = EXCLUDED.role, workspace_name = EXCLUDED.workspace_name;
