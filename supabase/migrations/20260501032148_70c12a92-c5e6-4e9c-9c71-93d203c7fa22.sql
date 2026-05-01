-- White Label settings: per-workspace agency branding
CREATE TABLE IF NOT EXISTS public.white_label_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  agency_name text,
  logo_url text,
  primary_color text,
  primary_foreground_color text,
  hide_kalpiz_branding boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read their own + other team members' branding (so theme applies to whole team).
-- Simplest: everyone authenticated can read all rows (branding is non-sensitive cosmetic data).
CREATE POLICY "Authenticated can read white_label_settings"
  ON public.white_label_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only managing_broker / admin / super_admin can write their own.
CREATE POLICY "Brokers manage own white_label_settings (insert)"
  ON public.white_label_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      has_role(auth.uid(), 'managing_broker'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

CREATE POLICY "Brokers manage own white_label_settings (update)"
  ON public.white_label_settings FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      has_role(auth.uid(), 'managing_broker'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (
      has_role(auth.uid(), 'managing_broker'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

CREATE POLICY "Brokers manage own white_label_settings (delete)"
  ON public.white_label_settings FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (
      has_role(auth.uid(), 'managing_broker'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

CREATE TRIGGER white_label_settings_updated_at
BEFORE UPDATE ON public.white_label_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for agency logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('agency-logos', 'agency-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public can view logos
CREATE POLICY "Public read agency-logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'agency-logos');

-- Brokers/admins can upload to their own folder (folder name = user_id)
CREATE POLICY "Brokers upload agency-logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agency-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    has_role(auth.uid(), 'managing_broker'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE POLICY "Brokers update own agency-logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'agency-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Brokers delete own agency-logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'agency-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);