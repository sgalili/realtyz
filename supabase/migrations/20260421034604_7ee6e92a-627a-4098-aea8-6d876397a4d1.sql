CREATE TABLE public.whatsapp_login_otps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_login_otps ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_whatsapp_login_otps_phone_created
ON public.whatsapp_login_otps (phone_number, created_at DESC);

CREATE INDEX idx_whatsapp_login_otps_expires
ON public.whatsapp_login_otps (expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_expired_whatsapp_login_otps()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.whatsapp_login_otps
  WHERE expires_at < now() - interval '1 day'
     OR consumed_at IS NOT NULL;
$$;