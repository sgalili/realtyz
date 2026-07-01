DELETE FROM public.ayrshare_social_accounts a
WHERE a.platform = 'facebook'
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_social_profile w
    WHERE w.ayrshare_profile_key = a.profile_key
  );