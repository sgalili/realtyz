UPDATE public.workspace_social_profile
SET facebook_page_id = '729806313557785',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND (facebook_page_id IS NULL OR facebook_page_id = '');