CREATE TABLE public.dynamic_qr_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
 qr_destination_url text NOT NULL CHECK (char_length(qr_destination_url) <= 2048 AND qr_destination_url ~ '^https?://' AND qr_destination_url !~ '^https?://[^/]*@' AND qr_destination_url !~* '^https?://(www\.)?toraff\.co\.il(:[0-9]+)?/go([/?#]|$)'),
 total_scans bigint NOT NULL DEFAULT 0 CHECK (total_scans >= 0),
 last_scanned_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT SELECT, INSERT ON public.dynamic_qr_codes TO authenticated;
GRANT UPDATE (name, qr_destination_url, updated_at, updated_by) ON public.dynamic_qr_codes TO authenticated;
GRANT ALL ON public.dynamic_qr_codes TO service_role;
ALTER TABLE public.dynamic_qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super Admins read QR codes" ON public.dynamic_qr_codes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super Admins create QR codes" ON public.dynamic_qr_codes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND total_scans = 0 AND last_scanned_at IS NULL AND updated_by = auth.uid());
CREATE POLICY "Super Admins update QR codes" ON public.dynamic_qr_codes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin') AND updated_by = auth.uid());
CREATE FUNCTION public.resolve_custom_qr_destination(code_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE destination text;
BEGIN
 UPDATE public.dynamic_qr_codes SET total_scans = total_scans + 1, last_scanned_at = now() WHERE id = code_id RETURNING qr_destination_url INTO destination;
 RETURN coalesce(destination, 'https://toraff.co.il/');
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_custom_qr_destination(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_custom_qr_destination(uuid) TO anon, authenticated, service_role;