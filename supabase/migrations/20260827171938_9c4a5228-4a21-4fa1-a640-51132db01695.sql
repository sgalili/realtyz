REVOKE ALL ON FUNCTION public.claim_fb_group_post_slot(uuid, text, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_fb_group_post_slot(uuid, text) FROM anon, authenticated;