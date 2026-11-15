REVOKE ALL ON public.dynamic_qr_codes FROM anon;
REVOKE UPDATE ON public.dynamic_qr_codes FROM authenticated;
GRANT UPDATE (name, qr_destination_url, updated_at, updated_by) ON public.dynamic_qr_codes TO authenticated;