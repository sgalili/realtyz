ALTER TABLE public.affiliate_profiles
ADD CONSTRAINT affiliate_profiles_user_id_profiles_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

REVOKE EXECUTE ON FUNCTION public.ensure_profile_row(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile_row(uuid) TO service_role;