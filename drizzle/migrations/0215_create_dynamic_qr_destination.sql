CREATE TABLE public.dynamic_qr_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  qr_destination_url text NOT NULL CHECK (char_length(qr_destination_url) <= 2048 AND qr_destination_url ~ '^https?://'),
  total_scans bigint NOT NULL DEFAULT 0 CHECK (total_scans >= 0),
  last_scanned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.dynamic_qr_config TO anon;
GRANT SELECT, UPDATE ON public.dynamic_qr_config TO authenticated;
GRANT ALL ON public.dynamic_qr_config TO service_role;

ALTER TABLE public.dynamic_qr_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read the dynamic QR configuration"
ON public.dynamic_qr_config
FOR SELECT
TO anon, authenticated
USING (id = 1);

CREATE POLICY "Only Super Admins can update the dynamic QR destination"
ON public.dynamic_qr_config
FOR UPDATE
TO authenticated
USING (id = 1 AND public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (id = 1 AND public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.resolve_dynamic_qr_destination()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  destination text;
BEGIN
  UPDATE public.dynamic_qr_config
  SET total_scans = total_scans + 1,
      last_scanned_at = now()
  WHERE id = 1
  RETURNING qr_destination_url INTO destination;

  IF destination IS NULL THEN
    RETURN 'https://toraff.co.il/';
  END IF;

  RETURN destination;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_dynamic_qr_destination() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dynamic_qr_destination() TO anon, authenticated, service_role;

INSERT INTO public.dynamic_qr_config (id, qr_destination_url)
SELECT 1, 'https://toraff.co.il/';