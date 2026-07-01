
UPDATE public.workspace_social_profile
SET ayrshare_profile_key = '5BE0F2A5-EC73482E-986EAE2A-E4EA9BA6',
    ayrshare_ref_id = NULL,
    facebook_page_id = NULL,
    facebook_page_name = NULL,
    connected_platforms = '{}',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.social_connections
SET last_test_status = 'pending_recheck',
    last_test_message = 'profile key rotated by owner',
    updated_at = now()
WHERE platform ILIKE 'facebook%';
