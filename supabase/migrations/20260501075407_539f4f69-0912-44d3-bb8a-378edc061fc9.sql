REVOKE ALL ON FUNCTION public.get_template_performance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_template_performance(uuid) TO authenticated;