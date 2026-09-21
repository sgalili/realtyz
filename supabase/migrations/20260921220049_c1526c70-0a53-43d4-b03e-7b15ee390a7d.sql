
CREATE OR REPLACE FUNCTION public.get_affiliate_call_attempts()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  status text,
  needs_callback boolean,
  callback_reason text,
  lead_id uuid,
  lead_name text,
  lead_phone text,
  listing_id uuid,
  address text,
  recording_url text,
  transcript_text text,
  summary text,
  duration_seconds integer,
  is_mine boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.id,
         cr.created_at,
         cr.status,
         cr.needs_callback,
         cr.callback_reason,
         cr.lead_id,
         COALESCE(cr.metadata->>'lead_name', l.full_name) AS lead_name,
         cr.caller_phone,
         NULLIF(cr.metadata->>'listing_id','')::uuid AS listing_id,
         cr.metadata->>'address' AS address,
         cr.recording_url,
         cr.transcript_text,
         cr.summary,
         cr.duration_seconds,
         (cr.metadata->>'affiliate_id') = auth.uid()::text AS is_mine
  FROM public.call_records cr
  LEFT JOIN public.leads l ON l.id = cr.lead_id
  WHERE auth.uid() IS NOT NULL
    AND cr.direction = 'outbound'
    AND (cr.metadata->>'affiliate_id' = auth.uid()::text OR cr.user_id = auth.uid())
  ORDER BY cr.created_at DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_call_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_call_attempts() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_lead_enrichment(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','unauthorized');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id AND l.workspace_owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.call_records cr
    WHERE cr.lead_id = _lead_id AND cr.metadata->>'affiliate_id' = auth.uid()::text
  ) OR EXISTS (
    SELECT 1 FROM public.affiliate_lead_submissions s
    WHERE s.lead_id = _lead_id AND s.affiliate_id = auth.uid()
  ) INTO allowed;

  IF NOT allowed THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  SELECT jsonb_build_object(
    'lead_id', _lead_id,
    'whatsapp_transcript', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'at', m.created_at,
               'from', m.sender_type,
               'channel', m.platform,
               'text', m.content
             ) ORDER BY m.created_at)
      FROM public.messages m
      WHERE m.lead_id = _lead_id
    ), '[]'::jsonb),
    'calls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'at', cr.created_at,
               'status', cr.status,
               'duration_seconds', cr.duration_seconds,
               'recording_url', cr.recording_url,
               'transcript', cr.transcript_text,
               'summary', cr.summary,
               'failure_reason', cr.callback_reason
             ) ORDER BY cr.created_at DESC)
      FROM public.call_records cr
      WHERE cr.lead_id = _lead_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lead_enrichment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lead_enrichment(uuid) TO authenticated;
