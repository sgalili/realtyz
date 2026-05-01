
-- AUTOMATIONS TABLE
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  template_key text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('prospect_added','meeting_booked','followup_after_hours','birthday_anniversary','lead_stage_changed')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_type text NOT NULL CHECK (action_type IN ('send_whatsapp','create_note','notify_agent','composite')),
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_user ON public.automations(user_id);
CREATE INDEX idx_automations_trigger ON public.automations(trigger_type) WHERE is_enabled = true;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own automations"
ON public.automations FOR ALL
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_automations_updated_at
BEFORE UPDATE ON public.automations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUTOMATION RUNS TABLE
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  automation_id uuid REFERENCES public.automations(id) ON DELETE SET NULL,
  lead_id uuid,
  trigger_type text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','skipped')),
  summary text,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_user_lead ON public.automation_runs(user_id, lead_id, created_at DESC);
CREATE INDEX idx_automation_runs_pending ON public.automation_runs(status, scheduled_for) WHERE status IN ('pending','running');

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own automation_runs"
ON public.automation_runs FOR SELECT
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users insert own automation_runs"
ON public.automation_runs FOR INSERT
TO authenticated
WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service can update automation_runs"
ON public.automation_runs FOR UPDATE
TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

-- DISPATCH HELPER: invoke run-automation edge function asynchronously
CREATE OR REPLACE FUNCTION public.dispatch_automation_run(_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _url text;
  _service_key text;
BEGIN
  BEGIN _url := current_setting('app.supabase_url', true); EXCEPTION WHEN others THEN _url := NULL; END;
  BEGIN _service_key := current_setting('app.service_role_key', true); EXCEPTION WHEN others THEN _service_key := NULL; END;
  IF _url IS NULL OR _service_key IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := _url || '/functions/v1/run-automation',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || _service_key,'apikey',_service_key),
    body := jsonb_build_object('run_id', _run_id)
  );
END;
$$;

-- TRIGGER: prospect added
CREATE OR REPLACE FUNCTION public.trg_automations_on_lead_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _auto record;
  _owner uuid;
  _run_id uuid;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  _owner := auth.uid();
  IF _owner IS NULL THEN RETURN NEW; END IF;

  FOR _auto IN
    SELECT * FROM public.automations
    WHERE user_id = _owner AND is_enabled = true AND trigger_type = 'prospect_added'
  LOOP
    INSERT INTO public.automation_runs (user_id, automation_id, lead_id, trigger_type, action_type, payload)
    VALUES (_owner, _auto.id, NEW.id, 'prospect_added', _auto.action_type,
            jsonb_build_object('lead_name', COALESCE(NEW.full_name, NEW.phone_number)))
    RETURNING id INTO _run_id;
    PERFORM public.dispatch_automation_run(_run_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER automations_on_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_automations_on_lead_insert();

-- TRIGGER: meeting booked (lead_stage transition)
CREATE OR REPLACE FUNCTION public.trg_automations_on_meeting_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _auto record;
  _owner uuid;
  _run_id uuid;
  _new text;
  _old text;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  _new := lower(COALESCE(NEW.lead_stage,''));
  _old := lower(COALESCE(OLD.lead_stage,''));
  IF _new = _old THEN RETURN NEW; END IF;
  IF _new NOT IN ('negotiation','qualified','meeting') THEN RETURN NEW; END IF;
  IF _old IN ('negotiation','qualified','meeting') THEN RETURN NEW; END IF;

  _owner := auth.uid();
  IF _owner IS NULL THEN RETURN NEW; END IF;

  FOR _auto IN
    SELECT * FROM public.automations
    WHERE user_id = _owner AND is_enabled = true AND trigger_type = 'meeting_booked'
  LOOP
    INSERT INTO public.automation_runs (user_id, automation_id, lead_id, trigger_type, action_type, payload)
    VALUES (_owner, _auto.id, NEW.id, 'meeting_booked', _auto.action_type,
            jsonb_build_object('lead_name', COALESCE(NEW.full_name, NEW.phone_number), 'stage', NEW.lead_stage))
    RETURNING id INTO _run_id;
    PERFORM public.dispatch_automation_run(_run_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER automations_on_lead_stage_change
AFTER UPDATE OF lead_stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_automations_on_meeting_booked();
