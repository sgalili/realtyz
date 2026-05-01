ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS commission_amount numeric,
  ADD COLUMN IF NOT EXISTS commission_currency text DEFAULT 'ILS',
  ADD COLUMN IF NOT EXISTS expected_close_date date;

CREATE INDEX IF NOT EXISTS idx_leads_expected_close_date ON public.leads(expected_close_date);

CREATE OR REPLACE FUNCTION public.get_business_performance(
  user_uuid uuid,
  days_window integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible jsonb;
  v_funnel jsonb;
  v_revenue jsonb;
  v_efficiency jsonb;
  v_since timestamptz := now() - make_interval(days => GREATEST(days_window, 1));
  v_is_priv boolean := public.has_role(user_uuid, 'admin'::app_role)
                       OR public.has_role(user_uuid, 'super_admin'::app_role);
BEGIN
  -- Funnel: distinct leads at each stage of the journey.
  -- A lead is counted in a step if it has reached that step OR a later one.
  WITH base AS (
    SELECT id, lead_stage, interaction_outcome, commission_amount,
           commission_currency, expected_close_date, created_at
    FROM public.leads
    WHERE is_demo = false
      AND (assigned_to = user_uuid OR v_is_priv)
      AND created_at >= v_since
  )
  SELECT jsonb_build_object(
    'leads',           COUNT(*)::int,
    'qualified',       COUNT(*) FILTER (
                          WHERE interaction_outcome IN ('Qualified','Meeting Scheduled','Closed Won')
                             OR lead_stage IN ('qualified','negotiation','awaiting_signature','closed')
                       )::int,
    'meetings',        COUNT(*) FILTER (
                          WHERE interaction_outcome IN ('Meeting Scheduled','Closed Won')
                             OR lead_stage IN ('negotiation','awaiting_signature','closed')
                       )::int,
    'offers',          COUNT(*) FILTER (
                          WHERE lead_stage IN ('negotiation','awaiting_signature','closed')
                             OR interaction_outcome = 'Closed Won'
                       )::int,
    'closed_won',      COUNT(*) FILTER (
                          WHERE interaction_outcome = 'Closed Won'
                             OR lead_stage = 'closed'
                       )::int,
    'closed_lost',     COUNT(*) FILTER (WHERE interaction_outcome = 'Closed Lost')::int,
    'ghosted',         COUNT(*) FILTER (WHERE interaction_outcome = 'Ghosted')::int
  )
  INTO v_funnel
  FROM base;

  -- Revenue attribution
  WITH base AS (
    SELECT id, interaction_outcome, lead_stage, commission_amount,
           COALESCE(commission_currency, 'ILS') AS commission_currency,
           expected_close_date
    FROM public.leads
    WHERE is_demo = false
      AND (assigned_to = user_uuid OR v_is_priv)
      AND commission_amount IS NOT NULL
      AND commission_amount > 0
  ),
  open_pipeline AS (
    SELECT * FROM base
    WHERE interaction_outcome IS DISTINCT FROM 'Closed Lost'
      AND interaction_outcome IS DISTINCT FROM 'Ghosted'
      AND (interaction_outcome IS DISTINCT FROM 'Closed Won' AND lead_stage IS DISTINCT FROM 'closed')
  ),
  closed AS (
    SELECT * FROM base
    WHERE interaction_outcome = 'Closed Won' OR lead_stage = 'closed'
  ),
  this_month AS (
    SELECT * FROM base
    WHERE expected_close_date IS NOT NULL
      AND date_trunc('month', expected_close_date) = date_trunc('month', current_date)
      AND interaction_outcome IS DISTINCT FROM 'Closed Lost'
      AND interaction_outcome IS DISTINCT FROM 'Ghosted'
  )
  SELECT jsonb_build_object(
    'currency',                'ILS',
    'pipeline_value',          COALESCE((SELECT SUM(commission_amount) FROM open_pipeline), 0),
    'pipeline_count',          (SELECT COUNT(*) FROM open_pipeline)::int,
    'closed_value',            COALESCE((SELECT SUM(commission_amount) FROM closed), 0),
    'closed_count',            (SELECT COUNT(*) FROM closed)::int,
    'projected_monthly',       COALESCE((SELECT SUM(commission_amount) FROM this_month), 0),
    'projected_monthly_count', (SELECT COUNT(*) FROM this_month)::int
  )
  INTO v_revenue;

  -- Efficiency: avg hours from lead.created_at to first qualifying signal (lead_stage 'qualified' OR outcome 'Qualified'/'Meeting Scheduled'/'Closed Won')
  -- per-channel = first inbound message channel for that lead. Falls back to 'unknown'.
  WITH base AS (
    SELECT l.id, l.created_at, l.outcome_set_at, l.interaction_outcome, l.lead_stage
    FROM public.leads l
    WHERE l.is_demo = false
      AND (l.assigned_to = user_uuid OR v_is_priv)
      AND l.created_at >= v_since
  ),
  first_channel AS (
    SELECT DISTINCT ON (m.lead_id)
      m.lead_id,
      COALESCE(NULLIF(m.channel, ''), NULLIF(m.platform, ''), 'unknown') AS channel
    FROM public.messages m
    WHERE m.lead_id IN (SELECT id FROM base)
    ORDER BY m.lead_id, m.created_at ASC
  ),
  qualified_at AS (
    -- Best-available timestamp for "became qualified".
    -- Prefer outcome_set_at when outcome is qualifying; otherwise the earliest outbound after creation as a proxy.
    SELECT b.id, b.created_at,
      CASE
        WHEN b.interaction_outcome IN ('Qualified','Meeting Scheduled','Closed Won')
          AND b.outcome_set_at IS NOT NULL
          THEN b.outcome_set_at
        WHEN b.lead_stage IN ('qualified','negotiation','awaiting_signature','closed')
          THEN (SELECT MIN(m2.created_at)
                FROM public.messages m2
                WHERE m2.lead_id = b.id
                  AND m2.created_at > b.created_at)
        ELSE NULL
      END AS qualified_at
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_efficiency
  FROM (
    SELECT
      COALESCE(fc.channel, 'unknown') AS channel,
      ROUND(AVG(EXTRACT(EPOCH FROM (qa.qualified_at - qa.created_at)) / 3600)::numeric, 1) AS avg_hours,
      COUNT(*)::int AS qualified_count
    FROM qualified_at qa
    LEFT JOIN first_channel fc ON fc.lead_id = qa.id
    WHERE qa.qualified_at IS NOT NULL
      AND qa.qualified_at > qa.created_at
    GROUP BY fc.channel
    ORDER BY avg_hours ASC NULLS LAST
  ) t;

  v_visible := jsonb_build_object(
    'window_days', days_window,
    'funnel',      v_funnel,
    'revenue',     v_revenue,
    'efficiency',  v_efficiency,
    'generated_at', now()
  );

  RETURN v_visible;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_performance(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_performance(uuid, integer) TO authenticated;