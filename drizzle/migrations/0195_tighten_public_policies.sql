ALTER TABLE public.demo_requests ADD COLUMN IF NOT EXISTS notified_at timestamptz;

DROP POLICY IF EXISTS "Anyone can request a demo" ON public.demo_requests;
CREATE POLICY "Public landing demo requests" ON public.demo_requests FOR INSERT TO anon, authenticated
WITH CHECK (
  source = 'landing' AND coalesce(status,'new') = 'new'
  AND workspace_owner_id = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid
  AND lead_id IS NULL AND google_event_id IS NULL AND google_event_link IS NULL AND notified_at IS NULL
  AND length(coalesce(first_name,'')) BETWEEN 1 AND 100 AND length(coalesce(last_name,'')) <= 100
  AND length(coalesce(phone,'')) BETWEEN 7 AND 20 AND length(coalesce(notes,'')) <= 2000
);
CREATE POLICY "Workspace members create demo requests" ON public.demo_requests FOR INSERT TO authenticated
WITH CHECK (ws_current_access(COALESCE(workspace_owner_id, 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'::uuid)) AND notified_at IS NULL);

DROP POLICY IF EXISTS "Anyone can submit a contact_submission" ON public.contact_submissions;
CREATE POLICY "Public contact form submissions" ON public.contact_submissions FOR INSERT TO anon, authenticated
WITH CHECK (
  workspace_owner_id IS NULL AND lead_id IS NULL AND coalesce(wa_sent,false) = false
  AND coalesce(status,'new') = 'new'
  AND length(full_name) BETWEEN 1 AND 120 AND length(phone_number) BETWEEN 7 AND 20
  AND length(coalesce(email,'')) <= 254 AND length(coalesce(message,'')) <= 2000 AND length(coalesce(tag,'')) <= 60
);

DROP POLICY IF EXISTS "Anyone can read short urls for redirect" ON public.short_urls;
CREATE POLICY "Owners read their own short urls" ON public.short_urls FOR SELECT TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS "promo counter readable" ON public.launch_promo_counter;
CREATE POLICY "Admins read promo counter" ON public.launch_promo_counter FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read cache" ON public.market_pulse_cache;
CREATE POLICY "Super admins read market pulse cache" ON public.market_pulse_cache FOR SELECT TO authenticated USING (has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "market_scrape_state_select" ON public.market_scrape_state;
CREATE POLICY "Super admins read market scrape state" ON public.market_scrape_state FOR SELECT TO authenticated USING (has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "market_scrape_runs_select" ON public.market_scrape_runs;
CREATE POLICY "Super admins read market scrape runs" ON public.market_scrape_runs FOR SELECT TO authenticated USING (has_role(auth.uid(),'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_market_pool_info()
RETURNS TABLE(finished_at timestamptz, claimed_at timestamptz, new_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.finished_at, r.claimed_at, r.new_count FROM public.market_scrape_runs r
  WHERE r.status = 'success' AND auth.uid() IS NOT NULL
  ORDER BY r.claimed_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_market_pool_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_pool_info() TO authenticated;