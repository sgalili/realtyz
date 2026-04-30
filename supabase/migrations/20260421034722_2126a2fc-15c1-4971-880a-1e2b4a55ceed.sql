CREATE POLICY "No direct read access to WhatsApp login codes"
ON public.whatsapp_login_otps
FOR SELECT
USING (false);

CREATE POLICY "No direct create access to WhatsApp login codes"
ON public.whatsapp_login_otps
FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct edit access to WhatsApp login codes"
ON public.whatsapp_login_otps
FOR UPDATE
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct delete access to WhatsApp login codes"
ON public.whatsapp_login_otps
FOR DELETE
USING (false);