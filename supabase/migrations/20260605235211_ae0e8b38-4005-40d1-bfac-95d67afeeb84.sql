INSERT INTO public.workspace_social_profile (id, ayrshare_profile_key, ayrshare_ref_id)
VALUES ('00000000-0000-0000-0000-000000000001', '87984B37-4F534C11-A0FCD260-B6077DBA', 'realtyz-workspace-manual')
ON CONFLICT (id) DO UPDATE
SET ayrshare_profile_key = EXCLUDED.ayrshare_profile_key,
    ayrshare_ref_id = COALESCE(public.workspace_social_profile.ayrshare_ref_id, EXCLUDED.ayrshare_ref_id);