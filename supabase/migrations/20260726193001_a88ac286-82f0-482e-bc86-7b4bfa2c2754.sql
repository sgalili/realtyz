UPDATE public.workspace_social_profile
SET ayrshare_profile_key = '02113484-22F64436-9E1AA4D7-9B014747',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.campaign_settings WHERE key = 'ayrshare_circuit_state';