REVOKE SELECT ON public.dynamic_qr_config FROM anon;

DROP POLICY "Anyone can read the dynamic QR configuration" ON public.dynamic_qr_config;

CREATE POLICY "Only Super Admins can read dynamic QR administration"
ON public.dynamic_qr_config
FOR SELECT
TO authenticated
USING (id = 1 AND public.has_role(auth.uid(), 'super_admin'));