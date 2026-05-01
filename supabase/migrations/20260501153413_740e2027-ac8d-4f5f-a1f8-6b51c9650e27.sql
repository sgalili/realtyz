-- 1. Add loss-reason columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS loss_reason_note text;

-- 2. Allowed loss-reason vocabulary (validated, but free-text fallback allowed via 'other')
CREATE OR REPLACE FUNCTION public.validate_lead_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- whenever interaction_outcome changes, stamp it
  IF NEW.interaction_outcome IS DISTINCT FROM OLD.interaction_outcome THEN
    NEW.outcome_set_at := now();
  END IF;

  -- Validate loss_reason vocabulary if provided
  IF NEW.loss_reason IS NOT NULL AND NEW.loss_reason NOT IN (
    'price_too_high','not_serious','location','timing','financing','found_elsewhere','other'
  ) THEN
    RAISE EXCEPTION 'Invalid loss_reason: %', NEW.loss_reason;
  END IF;

  -- Clear loss reason if outcome is back to non-failure
  IF NEW.interaction_outcome NOT IN ('Closed Lost','Ghosted') OR NEW.interaction_outcome IS NULL THEN
    NEW.loss_reason := NULL;
    NEW.loss_reason_note := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Outcome Intelligence RPC: conversion KPIs + failure-reason breakdown
CREATE OR REPLACE FUNCTION public.get_outcome_intelligence(_user_id uuid, _days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_leads integer;
  qualified_count integer;
  meeting_count integer;
  won_count integer;
  lost_count integer;
  ghosted_count integer;
BEGIN
  -- Authz
  IF _user_id <> auth.uid()
     AND NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE created_at >= now() - (_days || ' days')::interval),
    COUNT(*) FILTER (WHERE interaction_outcome = 'Qualified'),
    COUNT(*) FILTER (WHERE interaction_outcome = 'Meeting Scheduled'),
    COUNT(*) FILTER (WHERE interaction_outcome = 'Closed Won'),
    COUNT(*) FILTER (WHERE interaction_outcome = 'Closed Lost'),
    COUNT(*) FILTER (WHERE interaction_outcome = 'Ghosted')
  INTO total_leads, qualified_count, meeting_count, won_count, lost_count, ghosted_count
  FROM public.leads
  WHERE assigned_to = _user_id
    AND is_demo = false
    AND created_at >= now() - (_days || ' days')::interval;

  result := jsonb_build_object(
    'window_days', _days,
    'totals', jsonb_build_object(
      'total_leads', total_leads,
      'qualified', qualified_count,
      'meeting_scheduled', meeting_count,
      'won', won_count,
      'lost', lost_count,
      'ghosted', ghosted_count
    ),
    'conversion_rate', CASE WHEN total_leads > 0
      THEN round(100.0 * won_count / total_leads, 1)
      ELSE 0 END,
    'qualification_rate', CASE WHEN total_leads > 0
      THEN round(100.0 * (qualified_count + meeting_count + won_count) / total_leads, 1)
      ELSE 0 END,
    'failure_reasons_overall', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('reason', loss_reason, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT loss_reason, COUNT(*) cnt
        FROM public.leads
        WHERE assigned_to = _user_id
          AND is_demo = false
          AND loss_reason IS NOT NULL
          AND created_at >= now() - (_days || ' days')::interval
        GROUP BY loss_reason
      ) s
    ), '[]'::jsonb),
    'failure_by_deal_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('deal_type', deal_type, 'reason', loss_reason, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(deal_type, 'unknown') deal_type, loss_reason, COUNT(*) cnt
        FROM public.leads
        WHERE assigned_to = _user_id
          AND is_demo = false
          AND loss_reason IS NOT NULL
          AND created_at >= now() - (_days || ' days')::interval
        GROUP BY 1, 2
        ORDER BY cnt DESC
        LIMIT 20
      ) s
    ), '[]'::jsonb),
    'failure_by_location', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('city', city, 'reason', loss_reason, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(NULLIF(city,''),'לא ידוע') city, loss_reason, COUNT(*) cnt
        FROM public.leads
        WHERE assigned_to = _user_id
          AND is_demo = false
          AND loss_reason IS NOT NULL
          AND created_at >= now() - (_days || ' days')::interval
        GROUP BY 1, 2
        ORDER BY cnt DESC
        LIMIT 20
      ) s
    ), '[]'::jsonb),
    'conversion_by_deal_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'deal_type', deal_type,
        'total', total,
        'won', won,
        'rate', CASE WHEN total > 0 THEN round(100.0 * won / total, 1) ELSE 0 END
      ) ORDER BY total DESC)
      FROM (
        SELECT COALESCE(deal_type,'unknown') deal_type,
               COUNT(*) total,
               COUNT(*) FILTER (WHERE interaction_outcome = 'Closed Won') won
        FROM public.leads
        WHERE assigned_to = _user_id
          AND is_demo = false
          AND created_at >= now() - (_days || ' days')::interval
        GROUP BY 1
      ) s
    ), '[]'::jsonb),
    'conversion_by_location', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'city', city,
        'total', total,
        'won', won,
        'rate', CASE WHEN total > 0 THEN round(100.0 * won / total, 1) ELSE 0 END
      ) ORDER BY total DESC)
      FROM (
        SELECT COALESCE(NULLIF(city,''),'לא ידוע') city,
               COUNT(*) total,
               COUNT(*) FILTER (WHERE interaction_outcome = 'Closed Won') won
        FROM public.leads
        WHERE assigned_to = _user_id
          AND is_demo = false
          AND created_at >= now() - (_days || ' days')::interval
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 15
      ) s
    ), '[]'::jsonb)
  );

  RETURN result;
END;
$$;

-- 4. Follow-up suggestions: ghosted/cold leads ripe for a nudge
CREATE OR REPLACE FUNCTION public.get_followup_suggestions(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF _user_id <> auth.uid()
     AND NOT has_role(auth.uid(), 'admin'::app_role)
     AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lead_id', id,
    'lead_name', full_name,
    'phone', phone_number,
    'city', city,
    'deal_type', deal_type,
    'interaction_outcome', interaction_outcome,
    'last_outcome_at', outcome_set_at,
    'days_silent', GREATEST(0, EXTRACT(DAY FROM (now() - COALESCE(outcome_set_at, updated_at, created_at)))::int),
    'suggested_reason',
      CASE
        WHEN interaction_outcome = 'Ghosted' THEN 'מתעניין נעלם — נסה ניג''וג קצר אחרי 3 ימים'
        WHEN interaction_outcome = 'Qualified' THEN 'מוסמך — אין תזוזה. הצע להיפגש או לסייר בנכס'
        ELSE 'אין פעילות — בדוק אם יש מה להציע מחדש'
      END
  ) ORDER BY outcome_set_at DESC NULLS LAST), '[]'::jsonb)
  INTO result
  FROM public.leads
  WHERE assigned_to = _user_id
    AND is_demo = false
    AND interaction_outcome IN ('Ghosted', 'Qualified')
    AND COALESCE(outcome_set_at, updated_at, created_at) <= now() - interval '3 days'
    AND COALESCE(outcome_set_at, updated_at, created_at) >= now() - interval '60 days'
  LIMIT 25;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outcome_intelligence(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_followup_suggestions(uuid) TO authenticated;
