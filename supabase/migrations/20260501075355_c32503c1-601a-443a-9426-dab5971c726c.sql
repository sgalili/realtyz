ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS interaction_outcome text,
  ADD COLUMN IF NOT EXISTS outcome_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_set_by uuid;

CREATE OR REPLACE FUNCTION public.validate_lead_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.interaction_outcome IS NOT NULL
     AND NEW.interaction_outcome NOT IN ('Qualified','Meeting Scheduled','Closed Won','Closed Lost','Ghosted') THEN
    RAISE EXCEPTION 'invalid interaction_outcome: %', NEW.interaction_outcome;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.interaction_outcome IS DISTINCT FROM OLD.interaction_outcome
     AND NEW.interaction_outcome IS NOT NULL THEN
    NEW.outcome_set_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_lead_outcome ON public.leads;
CREATE TRIGGER trg_validate_lead_outcome
BEFORE INSERT OR UPDATE OF interaction_outcome ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.validate_lead_outcome();

CREATE INDEX IF NOT EXISTS idx_leads_interaction_outcome ON public.leads(interaction_outcome);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS template_label text;

CREATE INDEX IF NOT EXISTS idx_messages_template_key ON public.messages(template_key) WHERE template_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_template_performance(user_uuid uuid)
RETURNS TABLE (
  template_key text,
  template_label text,
  total_leads integer,
  won_count integer,
  scheduled_count integer,
  qualified_count integer,
  lost_count integer,
  ghosted_count integer,
  pending_count integer,
  success_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lead_template AS (
    SELECT DISTINCT ON (m.lead_id)
      m.lead_id,
      m.template_key,
      COALESCE(m.template_label, m.template_key) AS template_label
    FROM public.messages m
    JOIN public.leads l ON l.id = m.lead_id
    WHERE m.template_key IS NOT NULL
      AND m.direction = 'outbound'
      AND (
        l.assigned_to = user_uuid
        OR public.has_role(user_uuid, 'admin'::app_role)
        OR public.has_role(user_uuid, 'super_admin'::app_role)
      )
    ORDER BY m.lead_id, m.created_at DESC
  ),
  joined AS (
    SELECT lt.template_key, lt.template_label, l.interaction_outcome
    FROM lead_template lt
    JOIN public.leads l ON l.id = lt.lead_id
  )
  SELECT
    j.template_key,
    MAX(j.template_label) AS template_label,
    COUNT(*)::int AS total_leads,
    COUNT(*) FILTER (WHERE j.interaction_outcome = 'Closed Won')::int AS won_count,
    COUNT(*) FILTER (WHERE j.interaction_outcome = 'Meeting Scheduled')::int AS scheduled_count,
    COUNT(*) FILTER (WHERE j.interaction_outcome = 'Qualified')::int AS qualified_count,
    COUNT(*) FILTER (WHERE j.interaction_outcome = 'Closed Lost')::int AS lost_count,
    COUNT(*) FILTER (WHERE j.interaction_outcome = 'Ghosted')::int AS ghosted_count,
    COUNT(*) FILTER (WHERE j.interaction_outcome IS NULL)::int AS pending_count,
    CASE
      WHEN COUNT(*) FILTER (WHERE j.interaction_outcome IS NOT NULL) = 0 THEN 0
      ELSE ROUND(
        (COUNT(*) FILTER (WHERE j.interaction_outcome IN ('Closed Won','Meeting Scheduled')))::numeric
        / NULLIF(COUNT(*) FILTER (WHERE j.interaction_outcome IS NOT NULL), 0)::numeric * 100,
        1
      )
    END AS success_rate
  FROM joined j
  GROUP BY j.template_key
  ORDER BY success_rate DESC NULLS LAST, total_leads DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_template_performance(uuid) TO authenticated;