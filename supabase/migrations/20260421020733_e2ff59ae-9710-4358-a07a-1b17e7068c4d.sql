DROP POLICY IF EXISTS "Demo visitors can create demo sessions" ON public.demo_sessions;
DROP POLICY IF EXISTS "Demo visitors can refresh demo sessions" ON public.demo_sessions;
DROP POLICY IF EXISTS "Demo visitors can submit captured leads" ON public.demo_captured_leads;

CREATE POLICY "Demo visitors can create valid demo sessions"
ON public.demo_sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(session_id) BETWEEN 16 AND 128
  AND current_route LIKE '/%'
  AND length(current_route) <= 200
);

CREATE POLICY "Demo visitors can refresh valid demo sessions"
ON public.demo_sessions
FOR UPDATE
TO anon, authenticated
USING (
  length(session_id) BETWEEN 16 AND 128
  AND current_route LIKE '/%'
)
WITH CHECK (
  length(session_id) BETWEEN 16 AND 128
  AND current_route LIKE '/%'
  AND length(current_route) <= 200
);

CREATE POLICY "Demo visitors can submit valid captured leads"
ON public.demo_captured_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(coalesce(session_id, '')) BETWEEN 16 AND 128
  AND (nullif(email, '') IS NOT NULL OR nullif(phone_number, '') IS NOT NULL)
  AND engagement_score BETWEEN 0 AND 100
  AND length(value_trap_type) BETWEEN 3 AND 80
);