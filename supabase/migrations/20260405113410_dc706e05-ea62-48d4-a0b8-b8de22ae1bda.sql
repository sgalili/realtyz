
-- voters
DROP POLICY IF EXISTS "Authenticated users can insert voters" ON public.voters;
DROP POLICY IF EXISTS "Authenticated users can update voters" ON public.voters;
CREATE POLICY "Authenticated users can insert voters" ON public.voters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update voters" ON public.voters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- messages
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- campaigns
DROP POLICY IF EXISTS "Authenticated users can insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Authenticated users can update campaigns" ON public.campaigns;
CREATE POLICY "Authenticated users can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- tracking_links
DROP POLICY IF EXISTS "Authenticated users can create tracking links" ON public.tracking_links;
DROP POLICY IF EXISTS "Authenticated users can update tracking links" ON public.tracking_links;
CREATE POLICY "Authenticated users can create tracking links" ON public.tracking_links FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update tracking links" ON public.tracking_links FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ai_content_logs
DROP POLICY IF EXISTS "Authenticated users can insert ai_content_logs" ON public.ai_content_logs;
CREATE POLICY "Authenticated users can insert ai_content_logs" ON public.ai_content_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
