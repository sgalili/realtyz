UPDATE public.workspace_social_profile
SET ayrshare_profile_key = 'B2409ED6-51E643E7-AD7728C5-2B36C40B',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.workspace_social_profile (id, ayrshare_profile_key, updated_at)
SELECT '00000000-0000-0000-0000-000000000001', 'B2409ED6-51E643E7-AD7728C5-2B36C40B', now()
WHERE NOT EXISTS (SELECT 1 FROM public.workspace_social_profile WHERE id = '00000000-0000-0000-0000-000000000001');