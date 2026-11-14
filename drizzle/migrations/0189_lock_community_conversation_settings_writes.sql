REVOKE ALL ON public.community_conversation_settings FROM anon,authenticated;
GRANT SELECT ON public.community_conversation_settings TO authenticated;
GRANT ALL ON public.community_conversation_settings TO service_role;