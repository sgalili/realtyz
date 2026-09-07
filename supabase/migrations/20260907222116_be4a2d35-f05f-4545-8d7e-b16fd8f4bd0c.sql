-- Storage: allow any signed-in user to manage logos inside their own folder
DROP POLICY IF EXISTS "Brokers upload agency-logos" ON storage.objects;
DROP POLICY IF EXISTS "Brokers update own agency-logos" ON storage.objects;
DROP POLICY IF EXISTS "Owners list agency-logos" ON storage.objects;
DROP POLICY IF EXISTS "Brokers delete own agency-logos" ON storage.objects;

CREATE POLICY "agency_logos_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'agency-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "agency_logos_update_own_folder" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'agency-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'agency-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "agency_logos_delete_own_folder" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'agency-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "agency_logos_public_read" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'agency-logos');

-- Branding row: owner of the row can manage it without extra roles
DROP POLICY IF EXISTS "Brokers manage own white_label_settings (insert)" ON public.white_label_settings;
DROP POLICY IF EXISTS "Brokers manage own white_label_settings (update)" ON public.white_label_settings;
DROP POLICY IF EXISTS "Brokers manage own white_label_settings (delete)" ON public.white_label_settings;

CREATE POLICY "white_label_insert_own" ON public.white_label_settings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "white_label_update_own" ON public.white_label_settings FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "white_label_delete_own" ON public.white_label_settings FOR DELETE TO authenticated
USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.white_label_settings TO authenticated;
GRANT ALL ON public.white_label_settings TO service_role;